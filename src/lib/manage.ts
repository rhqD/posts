import { CONTROL_BASE, controlWrite } from './control';
export type Capability = 'users' | 'devices' | 'permissions' | 'audit';
export type User = { id: string; name: string; phone: string; role: string; avatar: string; builtin: boolean; activated: boolean; activated_at: string | null; disabled: boolean; created_at: string; sessions_count?: number };
export type Device = { key: string; name: string; room: string; kind: string; provider: string; online: boolean; hidden?: boolean; missing?: boolean; actions?: Record<string, unknown> };
export type Policy = { id: string; subject_kind: 'user'|'anonymous'; subject_id: string; resource: string; action: string; effect: 'allow'|'deny' };
export type AccessRow = { device: Device; read: boolean; control: boolean; sources: Policy[]; grantable: {read: boolean; control: boolean} };
export type Access = { devices: AccessRow[]; capabilities: Record<Capability, boolean>; grantable_capabilities: Record<Capability, boolean> };
const messages: Record<string,string> = { forbidden:'你没有执行此操作的管理权限。', unauthorized:'登录已过期，请重新登录。', not_found:'记录不存在或已被移除，请刷新重试。', already_exists:'该手机号已存在，请管理现有用户。', last_manager:'至少需要保留一位启用的权限管理员。', conflicting_rules:'现有拒绝规则覆盖了这次授权，请先检查授权来源。', invalid_input:'请检查填写的信息和头像格式。', bad_request:'提交内容无效，请检查后重试。', change_failed:'变更未能提交，请重试；如持续失败请检查服务和审计存储。', sync_failed:'暂时无法同步厂商设备，请稍后重试。', audit_unavailable:'审计存储不可用，变更未执行。' };
export class ManagementError extends Error { constructor(public status:number,public code:string){super(messages[code]||'请求未能完成，请稍后重试。');} }
export async function managementRequest<T>(path:string,body?:unknown,method='GET'):Promise<T>{
 if(!CONTROL_BASE) throw new Error('设备控制服务尚未配置。');
 const res=method==='GET'?await fetch(CONTROL_BASE+path,{credentials:'include',cache:'no-store'}):await controlWrite(path,body,method);
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new ManagementError(res.status,data.error||'change_failed');
 return data as T;
}
export const capabilityNames:Record<Capability,string>={users:'用户与会话管理',devices:'设备资料管理',permissions:'授予与撤销权限',audit:'查看审计记录'};
export function canManage(caps?:Partial<Record<Capability,boolean>>){return !!(caps?.users||caps?.devices||caps?.permissions);}
