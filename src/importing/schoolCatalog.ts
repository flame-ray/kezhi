export type SchoolSystem = "zf" | "kingosoft" | "urp" | "generic";

export interface SchoolDefinition {
  id: string;
  name: string;
  system: SchoolSystem;
  loginUrl?: string;
  domain?: string;
  status: "ready" | "beta" | "planned";
  region: string;
}

export const schoolCatalog: SchoolDefinition[] = [
  {
    id: "ndnu",
    name: "宁德师范学院",
    system: "zf",
    loginUrl: "https://jwgl.ndnu.edu.cn/jwglxt/xtgl/login_slogin.html",
    domain: "jwgl.ndnu.edu.cn",
    status: "beta",
    region: "福建 · 宁德",
  },
  {
    id: "zf-generic",
    name: "正方教务系统（其他学校）",
    system: "zf",
    status: "beta",
    region: "通用适配器",
  },
  {
    id: "kingosoft-generic",
    name: "青果教务系统",
    system: "kingosoft",
    status: "planned",
    region: "社区适配器",
  },
  {
    id: "urp-generic",
    name: "URP 高校教务系统",
    system: "urp",
    status: "planned",
    region: "社区适配器",
  },
  {
    id: "generic-import",
    name: "其他学校 / 通用导入",
    system: "generic",
    status: "ready",
    region: "Excel · ICS · 手动",
  },
];

export function resolveSchoolLoginUrl(value: string): SchoolDefinition | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return undefined;

    const hostname = url.hostname.toLowerCase();
    const known = schoolCatalog.find((item) => item.domain?.toLowerCase() === hostname);
    if (known) return { ...known, loginUrl: url.href };

    const normalizedHost = hostname.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    // Keep existing short-host account IDs stable; native identifiers allow 64 characters.
    let hash = 2166136261;
    for (const character of hostname) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    const safeHost = normalizedHost.length <= 57 ? normalizedHost : normalizedHost.slice(0, 48) + "-" + (hash >>> 0).toString(16).padStart(8, "0");
    if (!safeHost) return undefined;
    return {
      id: `custom-${safeHost}`,
      name: hostname,
      system: "generic",
      loginUrl: url.href,
      domain: hostname,
      status: "ready",
      region: "自定义网址",
    };
  } catch {
    return undefined;
  }
}
