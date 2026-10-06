"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [{ href: "/schedule", label: "Timetable" }, { href: "/classes", label: "Class formats" }, { href: "/instructors", label: "Coaches" }];
export default function ContextNav() {
  const path = usePathname() || "";
  if (!links.some(link => path === link.href || path.startsWith(`${link.href}/`))) return null;
  return <div className="sf-context"><nav className="sf-container" aria-label="Explore training">{links.map(link => <Link key={link.href} href={link.href} aria-current={path === link.href || path.startsWith(`${link.href}/`) ? "page" : undefined}>{link.label}</Link>)}</nav></div>;
}
