import { describe, expect, it } from 'vitest';
import { campusPlaces, placeAt, placeCenter, resolveCampusPlace, MAP_SIZE } from './campusMap';
describe('campus room matching',()=>{
  it.each([['cc301','求实楼'],['ＣＣ３０１','求实楼'],['C-C401','求实楼'],['@B-B301','求真楼'],['b301','求真楼'],['dD206','求是楼'],['aA102','求知楼'],['A楼301','求知楼'],['讲堂群305','讲堂群'],['化学实验楼505','化学实验楼'],['求实楼CC301','求实楼'],['学生公寓9号楼','学生公寓9号楼'],['第三四食堂','3、4号食堂']])('%s resolves to %s',(room,name)=>expect(resolveCampusPlace(room)?.name).toBe(name));
  it.each(['','未设置教室','301','hxx505','ABC301','cc301 / dd301','求实楼、求知楼','OtherCampus301'])('does not guess an unknown or ambiguous room %s',room=>expect(resolveCampusPlace(room)).toBeUndefined());
  it('covers every place with a unique id, valid rectangle',()=>{
    expect(new Set(campusPlaces.map(p=>p.id)).size).toBe(campusPlaces.length);
    for(const p of campusPlaces){const [x,y,w,h]=p.box;expect(x>=0&&y>=0&&w>0&&h>0&&x+w<=MAP_SIZE&&y+h<=MAP_SIZE).toBe(true);expect(placeAt(placeCenter(p))?.id).toBe(p.id);}
  });
});
