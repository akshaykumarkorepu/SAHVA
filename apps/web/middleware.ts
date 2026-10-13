import { NextResponse, type NextRequest } from "next/server";
import { decideAdminRoute, siteMode } from "./lib/adminHost";

export function middleware(req: NextRequest) {
  const d = decideAdminRoute(
    req.headers.get("host"),
    req.nextUrl.pathname,
    process.env.ADMIN_HOST || undefined,
    siteMode(process.env.SITE_MODE),
  );
  if (d.kind === "redirect") return NextResponse.redirect(new URL(d.to, req.url));
  if (d.kind === "not_found") {
    // Render the ordinary 404, so the clinic site gives no hint the console exists.
    return NextResponse.rewrite(new URL("/__not-found", req.url), { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // Everything except static files; the decision itself is cheap.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
