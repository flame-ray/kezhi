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
