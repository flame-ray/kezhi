// Coordinates belong to assets/campus-map/campus-overview-v1.png, not GPS.
export interface MapPoint { x: number; y: number }
export interface CampusPlace { id: string; name: string; aliases?: string[]; box: [number, number, number, number]; closed?: boolean }
export const MAP_SIZE = 1254;
export const campusPlaces: CampusPlace[] = [
  {id:'north-gate',name:'北大门',box:[335,106,112,62]},
  {id:'east-gate',name:'北侧门',box:[985,106,113,54]},
  {id:'lecture',name:'讲堂群',box:[235,225,140,117]},
  {id:'north-office',name:'北行政楼',box:[375,240,105,78]},
  {id:'chemistry',name:'化学实验楼',box:[193,347,166,46]},
  {id:'biology',name:'生物实验楼',box:[193,400,166,48]},
  {id:'physics',name:'物理实验楼',box:[193,453,166,52]},
  {id:'qiushi-d',name:'求是楼',box:[467,312,94,84]},
  {id:'qiushi-c',name:'求实楼',box:[534,388,94,98]},
  {id:'qiuzhen-b',name:'求真楼',box:[606,444,78,107]},
  {id:'qiuzhi-a',name:'求知楼',box:[699,460,74,112]},
  {id:'library',name:'图书馆',box:[248,605,148,88]},
  {id:'street',name:'学生街',box:[506,157,170,61]},
  {id:'hill',name:'校园山体景观',box:[679,218,223,107]},
  {id:'teachers',name:'教师公寓',box:[908,282,77,112]},
  {id:'canteen34',name:'3、4号食堂',aliases:['第三四食堂','第三、四食堂','三四食堂','第三食堂','第四食堂','3号食堂','4号食堂'],box:[762,348,111,74]},
  {id:'canteen12',name:'1、2号食堂',aliases:['第一二食堂','第一、二食堂','一二食堂','第一食堂','第二食堂','1号食堂','2号食堂'],box:[883,459,118,85]},
  {id:'plaza',name:'广场',box:[792,460,72,108]},
  {id:'yifu',name:'逸夫实训楼',box:[114,766,123,124]},
  {id:'gym',name:'体育馆',box:[452,781,164,106]},
  {id:'pool',name:'游泳池',box:[628,795,100,94]},
  {id:'track',name:'田径操场',aliases:['田径场'],box:[739,740,115,194]},
  {id:'clinical',name:'临床实验（实训）中心楼',aliases:['临床实验中心楼','临床实训中心楼'],box:[85,956,151,71]},
  {id:'medical',name:'基础医学实验（实训）中心楼',aliases:['基础医学实验中心楼','基础医学实训中心楼'],box:[147,1025,151,63]},
  {id:'south-office',name:'南行政楼',box:[417,958,89,108]},
  {id:'south-lab',name:'实验楼',box:[537,958,88,108]},
  ...([1,2,3,4,5,6,7,8,9] as const).map(n => ({id:`dorm${n}`,name:`学生公寓${n}号楼`,aliases:[`${n}号宿舍楼`,`${n}号公寓楼`],box: ({1:[1056,160,128,66],2:[1056,232,128,68],3:[1056,311,128,70],4:[899,649,122,75],5:[899,728,122,70],6:[899,805,122,70],7:[899,878,122,65],8:[644,974,122,70],9:[697,1059,129,63]} as Record<number,[number,number,number,number]>)[n]})),
  {id:'south-gate',name:'南大门',box:[250,1150,138,72],closed:true},
];

export function placeById(id:string) { return campusPlaces.find(place=>place.id===id); }
export function placeCenter(place:CampusPlace):MapPoint { const [x,y,w,h]=place.box; return {x:x+w/2,y:y+h/2}; }
const normalize=(text:string)=>text.normalize('NFKC').replace(/\s|@/g,'').toUpperCase();
export function resolveCampusPlace(location:string):CampusPlace|undefined {
  const text=normalize(location);
  if(!text) return;
  // Prefer the longest named match, e.g. 化学实验楼 over the generic 实验楼.
  const hits=campusPlaces.flatMap(place=>[place.name,...place.aliases??[]].filter(name=>text.includes(normalize(name))).map(name=>({place,name:normalize(name)})));
  const specific=hits.filter(hit=>!hits.some(other=>other.name!==hit.name&&other.name.includes(hit.name)));
  const ids=[...new Set(specific.map(hit=>hit.place.id))];
  if(ids.length===1)return placeById(ids[0]);
  if(ids.length>1)return;
  const match=text.match(/^([ABCD])(?:[-_]?[A-Z])?[-_]?\d{2,4}(?:教室|室)?$/) ?? text.match(/^([ABCD])(?:楼|栋|座)(?:[-_]?\d{2,4}(?:教室|室)?)?$/);
  if(match)return placeById(({A:'qiuzhi-a',B:'qiuzhen-b',C:'qiushi-c',D:'qiushi-d'} as Record<string,string>)[match[1]]);
}

export function placeAt(point:MapPoint) {return campusPlaces.find(({box:[x,y,w,h]})=>point.x>=x&&point.x<=x+w&&point.y>=y&&point.y<=y+h);}
