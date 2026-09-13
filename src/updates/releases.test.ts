import { describe, it, expect } from 'vitest';
import { isNewerVersion, OFFICIAL_RELEASES_URL, parseRelease } from './releases';
const release = {draft:false,prerelease:false,tag_name:'v1.2.0',html_url:`${OFFICIAL_RELEASES_URL}/tag/v1.2.0`,published_at:'2026-09-12T12:00:00Z',body:'# 更新\n考试中心',assets:[{name:'Kezhi-1.2.0-arm64.apk',size:20000000}]};
describe('official release metadata', () => {
  it('compares versions numerically', () => { expect(isNewerVersion('v1.10.0','1.9.9')).toBe(true); expect(isNewerVersion('1.2.0','1.2.0')).toBe(false); expect(isNewerVersion('1.1.9','1.2.0')).toBe(false); expect(isNewerVersion('2.0.0','1.99.99')).toBe(true); });
  it('does not promote prerelease or malformed versions', () => { for(const value of ['1.3.0-beta','01.3.0','v2','bad','99999999999999999999.0.0']) expect(isNewerVersion(value,'1.0.0')).toBe(false); });
  it('reads release notes as data and restricts displayed installer assets', () => { expect(parseRelease(release).notes).toContain('# 更新'); expect(parseRelease({...release,assets:[...release.assets,{name:'unknown.zip',size:5},{name:'Kezhi-test.exe',size:-1}]}).assets).toEqual(release.assets); });
  it('rejects wrong origins, draft and prerelease releases', () => { expect(()=>parseRelease({...release,html_url:'https://evil.test'})).toThrow(); expect(()=>parseRelease({...release,prerelease:true})).toThrow(); expect(()=>parseRelease({...release,draft:true})).toThrow(); });
  it('rejects missing publication fields and truncates oversized notes', () => { expect(()=>parseRelease({...release,published_at:'bad'})).toThrow(); expect(()=>parseRelease({...release,assets:null})).toThrow(); expect(parseRelease({...release,body:'x'.repeat(40000)}).notes).toHaveLength(30000); });
});
