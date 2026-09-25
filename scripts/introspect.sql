-- Emits the public schema as JSON. Used by scripts/gen-types.py.
\pset format unaligned
\pset tuples_only on
select json_build_object(
  'enums', (
    select coalesce(json_agg(json_build_object('name', t.typname, 'values', v.vals) order by t.typname), '[]')
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
    join lateral (
      select json_agg(e.enumlabel order by e.enumsortorder) vals
      from pg_enum e where e.enumtypid = t.oid
    ) v on true
    where t.typtype = 'e'
  ),
  'relations', (
    select coalesce(json_agg(r order by r.kind, r.name), '[]') from (
      select c.relname as name,
             case c.relkind when 'r' then 'table' when 'v' then 'view' end as kind,
             (select json_agg(json_build_object(
                'name', a.attname,
                'udt',  ft.typname,
                'is_array', (ft.typcategory = 'A'),
                'elem_udt', coalesce(et.typname, ''),
                'elem_is_enum', coalesce(et.typtype = 'e', false),
                'is_enum', (ft.typtype = 'e'),
                'notnull', a.attnotnull,
                'has_default', a.atthasdef,
                'generated', (a.attgenerated <> '')
              ) order by a.attnum)
              from pg_attribute a
              join pg_type ft on ft.oid = a.atttypid
              left join pg_type et on et.oid = ft.typelem
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
             ) as columns
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind in ('r','v')
    ) r
  ),
  'foreign_keys', (
    select coalesce(json_agg(json_build_object(
      'name', c.conname,
      'from_relation', src.relname,
      'columns', (
        select array_agg(a.attname order by k.ord)
        from unnest(c.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ),
      'referenced_relation', tgt.relname,
      'referenced_columns', (
        select array_agg(a.attname order by k.ord)
        from unnest(c.confkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum
      ),
      -- One-to-one when the referencing columns are themselves unique.
      'is_one_to_one', exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisunique
          and i.indnatts = array_length(c.conkey, 1)
          and i.indkey::int2[] @> c.conkey and c.conkey @> i.indkey::int2[]
      )
    ) order by c.conname), '[]')
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_class tgt on tgt.oid = c.confrelid
    join pg_namespace n on n.oid = src.relnamespace and n.nspname = 'public'
    where c.contype = 'f'
  ),
  'functions', (
    select coalesce(json_agg(json_build_object(
      'name', p.proname,
      'args', pg_get_function_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'returns_set', p.proretset
    ) order by p.proname), '[]')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prokind = 'f'
  )
);
