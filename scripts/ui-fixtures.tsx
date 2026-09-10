// Local visual fixtures. Vite's production entry does not include this page.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ImportWizard } from "../src/components/ImportWizard";
import { SyncReviewDialog } from "../src/components/SyncReviewDialog";
import { ExportDialog } from "../src/components/ExportDialog";
import { defaultPresets } from "../src/data/demo";
import { Presence } from "../src/ui/Motion";
import type { CourseMeeting } from "../src/domain/schedule";
import "../src/styles.css";
import "../src/material.css";
const sample: CourseMeeting = { id: "visual-course", courseCode: "UI101", title: "大学英语（一）", teacher: "示例教师", location: "教学楼 A-301", day: 4, startPeriod: 1, endPeriod: 2, weeks: [1,3,5,7,9], color: "teal" };
function Fixtures() {
  const [open,setOpen]=useState<"sync" | "import" | "export" | undefined>();
  return <div className="app-shell"><main><button onClick={()=>setOpen("sync")}>测试同步弹窗</button><button onClick={()=>setOpen("import")}>测试导入流程</button><button onClick={()=>setOpen("export")}>测试日历写入</button></main>
    <Presence>{open==="export" && <ExportDialog snapshot={{courses:[sample],presets:defaultPresets,activePresetId:"summer"}} preset={defaultPresets[0]} calendar={{weekOneStartsOn:new Date(2026,8,14,12),teachingStartsOn:new Date(2026,8,17,12)}} week={1} onClose={()=>setOpen(undefined)} onPrint={()=>{}} onExported={()=>{}} />}</Presence>
    <Presence>{open==="sync" && <SyncReviewDialog plan={{ checkedAt: new Date().toISOString(), unchangedCount: 12, changes:[{id:"change",kind:"modified",title:sample.title,local:sample,official:{...sample,location:"教学楼 B-205"},changedFields:["教室"]}] }} onClose={()=>setOpen(undefined)} onApply={()=>setOpen(undefined)}/>}</Presence>
    <Presence>{open==="import" && <ImportWizard onClose={()=>setOpen(undefined)} onStartManual={()=>setOpen(undefined)} onStartCalendarImport={()=>setOpen(undefined)} onRestore={()=>setOpen(undefined)} onImported={(_school, _account, courses)=>{ window.dispatchEvent(new CustomEvent("kezhi-test-import", { detail: courses })); setOpen(undefined); }}/>}</Presence>
  </div>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixtures/></StrictMode>);
