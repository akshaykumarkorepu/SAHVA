#!/usr/bin/env python3
"""
Generate packages/types/database.ts from a live Postgres schema.

The canonical generator is `supabase gen types typescript --linked`, which needs
a linked hosted project. This script produces the same shape from ANY Postgres
that has the migrations applied — including the throwaway cluster in CI — so
type drift is caught on every PR without needing Supabase credentials.

  python3 scripts/gen-types.py > packages/types/database.ts
"""
import json
import re
import subprocess
import sys
import os

PGBIN = os.environ.get("PGBIN", "/opt/homebrew/opt/postgresql@16/bin")
HOST = os.environ.get("PGHOST_TEST", "127.0.0.1")
PORT = os.environ.get("PGPORT", "55432")
USER = os.environ.get("PGUSER", "postgres")
DB = os.environ.get("PGDATABASE", "sahva_test")
HERE = os.path.dirname(os.path.abspath(__file__))

SCALARS = {
    "uuid": "string", "text": "string", "citext": "string", "varchar": "string",
    "bpchar": "string", "name": "string", "timestamptz": "string",
    "timestamp": "string", "date": "string", "time": "string", "timetz": "string",
    "interval": "string", "int2": "number", "int4": "number", "int8": "number",
    "numeric": "number", "float4": "number", "float8": "number",
    "bool": "boolean", "json": "Json", "jsonb": "Json", "void": "undefined",
}


def scalar(udt: str) -> str:
    return SCALARS.get(udt, "string")


def col_type(c: dict) -> str:
    if c["is_array"]:
        inner = (f'Database["public"]["Enums"]["{c["elem_udt"]}"]'
                 if c["elem_is_enum"] else scalar(c["elem_udt"]))
        return f"{inner}[]"
    if c["is_enum"]:
        return f'Database["public"]["Enums"]["{c["udt"]}"]'
    return scalar(c["udt"])


def introspect() -> dict:
    out = subprocess.run(
        [f"{PGBIN}/psql", "-h", HOST, "-p", PORT, "-U", USER, "-d", DB, "-X",
         "-f", os.path.join(HERE, "introspect.sql")],
        capture_output=True, text=True, check=True,
        env={**os.environ, "LC_ALL": "C", "LANG": "C"},
    ).stdout
    # psql prints "Output format is unaligned." before the payload.
    return json.loads(out[out.index("{"):])


def split_args(sig: str):
    """Split a pg_get_function_arguments() signature at top-level commas."""
    depth, cur, parts = 0, "", []
    for ch in sig:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def parse_arg(arg: str):
    """'p_reason text DEFAULT NULL::text' -> ('p_reason', 'text', True)"""
    has_default = " DEFAULT " in arg
    arg = arg.split(" DEFAULT ")[0].strip()
    arg = re.sub(r"^(IN|OUT|INOUT|VARIADIC)\s+", "", arg)
    name, _, typ = arg.partition(" ")
    return name.strip(), typ.strip(), has_default


def pg_to_ts(pgtype: str, enums: set, tables: set) -> str:
    t = pgtype.strip()
    arr = t.endswith("[]")
    if arr:
        t = t[:-2].strip()
    base = {
        "timestamp with time zone": "string", "timestamp without time zone": "string",
        "time without time zone": "string", "character varying": "string",
        "double precision": "number", "smallint": "number", "integer": "number",
        "bigint": "number", "boolean": "boolean", "uuid": "string", "text": "string",
        "date": "string", "numeric": "number", "jsonb": "Json", "json": "Json",
        "void": "undefined",
    }.get(t)
    if base is None:
        bare = t.split(".")[-1]
        if bare in enums:
            base = f'Database["public"]["Enums"]["{bare}"]'
        elif bare in tables:
            base = f'Database["public"]["Tables"]["{bare}"]["Row"]'
        else:
            base = "Json"
    return base + ("[]" if arr else "")


def relationships_for(fks: list, relation: str) -> list[str]:
    """
    supabase-js requires a Relationships entry on every table and view; without
    it the schema fails the GenericSchema constraint and EVERY query collapses
    to `never`. These also make embedded selects — select("*, doctors(...)") —
    type-check.
    """
    out = []
    for fk in fks:
        if fk["from_relation"] != relation:
            continue
        cols = ", ".join(f'"{c}"' for c in fk["columns"])
        ref = ", ".join(f'"{c}"' for c in fk["referenced_columns"])
        out.append(
            "          {\n"
            f'            foreignKeyName: "{fk["name"]}";\n'
            f'            columns: [{cols}];\n'
            f'            isOneToOne: {str(bool(fk["is_one_to_one"])).lower()};\n'
            f'            referencedRelation: "{fk["referenced_relation"]}";\n'
            f'            referencedColumns: [{ref}];\n'
            "          },"
        )
    return out


def main() -> None:
    s = introspect()
    enum_names = {e["name"] for e in s["enums"]}
    table_names = {r["name"] for r in s["relations"] if r["kind"] == "table"}
    fks = s.get("foreign_keys", [])

    L = []
    w = L.append
    w("// ---------------------------------------------------------------------------")
    w("// GENERATED FILE — DO NOT EDIT BY HAND.")
    w("//")
    w("//   python3 scripts/gen-types.py > packages/types/database.ts")
    w("//")
    w("// Derived by introspecting the schema in supabase/migrations. CI regenerates")
    w("// this and fails if it differs, so the types can never drift from the tables.")
    w("// ---------------------------------------------------------------------------")
    w("")
    w("export type Json =")
    w("  | string")
    w("  | number")
    w("  | boolean")
    w("  | null")
    w("  | { [key: string]: Json | undefined }")
    w("  | Json[];")
    w("")
    w("export type Database = {")
    w("  public: {")

    # Tables
    w("    Tables: {")
    for r in sorted((r for r in s["relations"] if r["kind"] == "table"), key=lambda r: r["name"]):
        w(f"      {r['name']}: {{")
        w("        Row: {")
        for c in r["columns"]:
            null = "" if c["notnull"] else " | null"
            w(f"          {c['name']}: {col_type(c)}{null};")
        w("        };")
        w("        Insert: {")
        for c in r["columns"]:
            if c["generated"]:
                continue          # generated columns cannot be written
            optional = (not c["notnull"]) or c["has_default"]
            null = "" if c["notnull"] else " | null"
            w(f"          {c['name']}{'?' if optional else ''}: {col_type(c)}{null};")
        w("        };")
        w("        Update: {")
        for c in r["columns"]:
            if c["generated"]:
                continue
            null = "" if c["notnull"] else " | null"
            w(f"          {c['name']}?: {col_type(c)}{null};")
        w("        };")
        rels = relationships_for(fks, r["name"])
        if rels:
            w("        Relationships: [")
            for line in rels:
                w(line)
            w("        ];")
        else:
            w("        Relationships: [];")
        w("      };")
    w("    };")

    # Views
    w("    Views: {")
    for r in sorted((r for r in s["relations"] if r["kind"] == "view"), key=lambda r: r["name"]):
        w(f"      {r['name']}: {{")
        w("        Row: {")
        for c in r["columns"]:
            null = "" if c["notnull"] else " | null"
            w(f"          {c['name']}: {col_type(c)}{null};")
        w("        };")
        # Views carry no foreign keys of their own.
        w("        Relationships: [];")
        w("      };")
    w("    };")

    # Functions (RPCs)
    w("    Functions: {")
    for f in sorted(s["functions"], key=lambda f: f["name"]):
        w(f"      {f['name']}: {{")
        args = [parse_arg(a) for a in split_args(f["args"]) if a.strip()]
        args = [a for a in args if a[0]]
        if args:
            w("        Args: {")
            for name, typ, has_def in args:
                w(f"          {name}{'?' if has_def else ''}: {pg_to_ts(typ, enum_names, table_names)};")
            w("        };")
        else:
            w("        Args: Record<string, never>;")

        ret = f["returns"].strip()
        if ret.upper().startswith("TABLE("):
            inner = ret[len("TABLE("):-1]
            fields = []
            for part in split_args(inner):
                nm, _, ty = part.strip().partition(" ")
                fields.append(f"{nm}: {pg_to_ts(ty, enum_names, table_names)}")
            w("        Returns: { " + "; ".join(fields) + " }[];")
        elif ret.upper().startswith("SETOF "):
            w(f"        Returns: {pg_to_ts(ret[6:], enum_names, table_names)}[];")
        else:
            suffix = "[]" if f["returns_set"] else ""
            w(f"        Returns: {pg_to_ts(ret, enum_names, table_names)}{suffix};")
        w("      };")
    w("    };")

    # Enums
    w("    Enums: {")
    for e in s["enums"]:
        vals = " | ".join(f'"{v}"' for v in e["values"])
        w(f"      {e['name']}: {vals};")
    w("    };")
    w("    CompositeTypes: Record<string, never>;")
    w("  };")
    w("};")
    w("")
    w("// --- Convenience aliases -------------------------------------------------")
    w("")
    w("type PublicSchema = Database['public'];")
    w("")
    w("export type Tables<T extends keyof PublicSchema['Tables']> =")
    w("  PublicSchema['Tables'][T]['Row'];")
    w("export type TablesInsert<T extends keyof PublicSchema['Tables']> =")
    w("  PublicSchema['Tables'][T]['Insert'];")
    w("export type TablesUpdate<T extends keyof PublicSchema['Tables']> =")
    w("  PublicSchema['Tables'][T]['Update'];")
    w("export type Views<T extends keyof PublicSchema['Views']> =")
    w("  PublicSchema['Views'][T]['Row'];")
    w("export type Enums<T extends keyof PublicSchema['Enums']> =")
    w("  PublicSchema['Enums'][T];")
    w("export type FunctionArgs<T extends keyof PublicSchema['Functions']> =")
    w("  PublicSchema['Functions'][T]['Args'];")
    w("export type FunctionReturns<T extends keyof PublicSchema['Functions']> =")
    w("  PublicSchema['Functions'][T]['Returns'];")
    w("")

    sys.stdout.write("\n".join(L))


if __name__ == "__main__":
    main()
