import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import mapImage from '../../assets/campus-map/campus-overview-v2.png';
import { campusPlaces, MAP_SIZE, placeById, placeCenter, resolveCampusPlace } from '../campus/campusMap';
import { DialogSurface } from '../ui/DialogSurface';
import { Icon } from '../ui/Icon';
import '../campus/campus.css';

export function CampusMapDialog({location,courseTitle,onClose}:{location:string;courseTitle:string;onClose:()=>void}) {
  const initial=useMemo(()=>resolveCampusPlace(location),[location]);
  const [destinationId,setDestinationId]=useState(initial?.id??'');
  const destination=placeById(destinationId);
  const [imageFailed,setImageFailed]=useState(false);
  const [zoom,setZoom]=useState(1);
  const [focusRequest,setFocusRequest]=useState(0);
  const viewport=useRef<HTMLDivElement>(null);
  const canvas=useRef<SVGSVGElement>(null);
  const [baseSize,setBaseSize]=useState(320);
  useLayoutEffect(()=>{
    const element=viewport.current;if(!element)return;
    const resize=()=>setBaseSize(Math.min(element.clientWidth,element.clientHeight));
    resize();const observer=new ResizeObserver(resize);observer.observe(element);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const element=viewport.current,svg=canvas.current;if(!element||!svg)return;
    const center=destination?placeCenter(destination):{x:MAP_SIZE/2,y:MAP_SIZE/2};
    const frame=requestAnimationFrame(()=>{
      const scale=svg.getBoundingClientRect().width/MAP_SIZE;
      element.scrollTo({left:center.x*scale-element.clientWidth/2,top:center.y*scale-element.clientHeight/2,behavior:'instant'});
    });return()=>cancelAnimationFrame(frame);
  },[destination,zoom,focusRequest,baseSize]);
  const targetBox=destination?.box;
  return <DialogSurface className="campus-map-dialog" labelledBy="campus-map-title" onClose={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">校园地图 · 楼栋位置</span><h2 id="campus-map-title">教室位置</h2><p>{courseTitle} · {location||'未填写教室'}</p></div><button className="icon-button" aria-label="关闭校园地图" onClick={onClose}><Icon name="close" /></button></header>
    <div className="dialog-body campus-map-body">
      {!initial&&<p className="campus-map-notice">暂未识别这个教室，请手动选择楼栋。地图仅适用于这张校园图对应的校区。</p>}
      <div className="campus-fields">
        <label className="field"><span>查看楼栋</span><select aria-label="查看楼栋" value={destinationId} onChange={event=>setDestinationId(event.target.value)}><option value="">选择楼栋</option>{campusPlaces.map(place=><option key={place.id} value={place.id}>{place.name}{place.closed?'（原图标注在建）':''}</option>)}</select></label>
      </div>
      <div className="campus-map-tools"><span>放大后可滑动查看地图</span><div><button className="icon-button" aria-label="缩小地图" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.5))}>−</button><button className="soft-button" onClick={()=>{setZoom(1);setFocusRequest(value=>value+1);}}>全图</button><button className="icon-button" aria-label="放大地图" disabled={zoom>=4} onClick={()=>setZoom(value=>Math.min(4,value+.5))}>+</button><button className="soft-button" disabled={!destination} onClick={()=>{setZoom(2);setFocusRequest(value=>value+1);}}>回到楼栋</button></div></div>
      <div className="campus-map-viewport" ref={viewport} tabIndex={0} aria-label="校园地图，可滚动浏览">
        <svg ref={canvas} className="campus-map-canvas" style={{width:baseSize*zoom}} viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} width={MAP_SIZE} height={MAP_SIZE} role="img" aria-label={destination?`校园地图，已高亮${destination.name}`:'校园地图，尚未选择楼栋'}>
          <image href={mapImage} width={MAP_SIZE} height={MAP_SIZE} onError={()=>setImageFailed(true)} />
          <g pointerEvents="none">
            {targetBox&&<g key={destinationId} className="campus-highlight" style={{transformOrigin:`${targetBox[0]+targetBox[2]/2}px ${targetBox[1]+targetBox[3]/2}px`}}>
              <rect className="campus-highlight-halo" x={targetBox[0]-12} y={targetBox[1]-12} width={targetBox[2]+24} height={targetBox[3]+24} rx={20} />
              <rect className="campus-highlight-outline" x={targetBox[0]-6} y={targetBox[1]-6} width={targetBox[2]+12} height={targetBox[3]+12} rx={14} />
              <rect data-testid="destination-highlight" className="campus-destination" x={targetBox[0]-6} y={targetBox[1]-6} width={targetBox[2]+12} height={targetBox[3]+12} rx={14} />
            </g>}
          </g>
        </svg>
      </div>
      {imageFailed&&<p className="form-error" role="alert">地图图片加载失败，请关闭后重试。</p>}
      <section className="campus-location-summary" aria-live="polite">
        <strong>{destination?`楼栋：${destination.name}`:'请选择楼栋'}</strong>
        <p>{destination?.closed?'南大门：原图标注在建，仅显示位置。':'仅展示楼栋位置，不提供路线导航。'}</p>
        <small>仅适用本图对应校区。示意图不代表教室楼层或精确入口，请以现场标识为准。不申请定位权限。</small>
      </section>
    </div>
    <footer className="dialog-footer"><button className="primary-button" onClick={onClose}>返回课程</button></footer>
  </DialogSurface>;
}
