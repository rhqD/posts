"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Link2, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Users, LampDesk, X } from 'lucide-react';
import { CONTROL_BASE, userName, type Session } from '@/lib/control';
import { managementRequest as api, ManagementError, capabilityNames, type User, type Device, type Policy, type Capability, type Access, type AccessRow } from '@/lib/manage';
import { Avatar, AvatarEditor } from '@/components/account/Avatar';
import { DEVICE_MAP } from '@/components/yard/device-map';
import styles from './manage.module.css';
import SubjectSelect from './SubjectSelect';

type Section='users'|'permissions'|'devices';
const titles:Record<Section,string>={users:'用户管理',permissions:'权限管理',devices:'设备管理'};
const hints:Record<Section,string>={users:'内置账号 · 登录准入与激活',permissions:'按设备授予访问，按职责授予管理能力',devices:'真实设备 · 资料与展示设置'};
const sections:Section[]=['users','permissions','devices'];
const sectionIcons={users:Users,permissions:ShieldCheck,devices:LampDesk};
const levels={none:'未授权',read:'只读',control:'可控制'};
type Level=keyof typeof levels;
const levelOf=(row:AccessRow):Level=>row.control?'control':row.read?'read':'none';
const displayName=userName;
const formatDate=(value?:string|null)=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium'}).format(new Date(value)):'尚未激活';
const errorText=(e:unknown)=>e instanceof Error?e.message:'请求失败，请稍后重试。';
const linkedDevice=(key:string)=>Object.values(DEVICE_MAP).some(binding=>binding.device===key);

function Modal({title,children,onClose,busy=false}:{title:string;children:React.ReactNode;onClose:()=>void;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className={styles.modal} aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className={styles.modalHeading}><h2>{title}</h2><button type="button" className={styles.iconButton} aria-label="关闭" disabled={busy} onClick={onClose}><X size={18}/></button></div>{children}
 </dialog>;
}
function Notice({text}:{text:string}){return text?<p role="alert" className={styles.error}>{text}</p>:null;}
function SaveButton({busy,label='保存'}:{busy:boolean;label?:string}){return <button type="submit" disabled={busy} className={styles.primary}>{busy?<LoaderCircle size={15} className={styles.spinning}/>:<Check size={15}/>} {busy?'提交中…':label}</button>;}
function UserForm({user,onSave,onClose,busy,error,onToggle,onRevoke}:{onToggle:()=>void;onRevoke:()=>void;user?:User;onSave:(value:{name:string;phone?:string;avatar:string})=>void;onClose:()=>void;busy:boolean;error:string}){
 const [name,setName]=useState(user?.name||''),[phone,setPhone]=useState(''),[avatar,setAvatar]=useState(user?.avatar||'');
 return <Modal title={user?'用户资料':'新增内置用户'} onClose={onClose} busy={busy}><form onSubmit={e=>{e.preventDefault();onSave({name:name.trim(),avatar,...(!user?{phone:phone.trim()}:{} )});}}>
  <AvatarEditor name={name} value={avatar} onChange={setAvatar} disabled={busy}/>
  <div className={styles.fields}><label>姓名<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)} autoComplete="off" placeholder="例如：家人 A"/></label>
  <label>登录手机号<input required={!user} readOnly={!!user} value={user?user.phone:phone} onChange={e=>setPhone(e.target.value)} type="tel" pattern={user?undefined:'\\+?[0-9]{7,15}'} autoComplete="off" placeholder="由管理员指定的手机号"/></label></div>
  <p className={styles.muted}>{user?`激活状态：${user.activated?'已激活 · '+formatDate(user.activated_at):'未激活'}。登录手机号作为身份标识保留。`:'创建后可以使用短信验证码登录；首次验证成功后激活，默认不授予设备或管理权限。'}</p>
  {user&&<div className={styles.userActions}><button type="button" className={styles.textButton} disabled={busy} onClick={onToggle}>{user.disabled?'重新启用':'停用用户'}</button><button type="button" className={styles.textButton} disabled={busy} onClick={onRevoke}>退出全部设备</button></div>}
  <Notice text={error}/><div className={styles.modalActions}><button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>取消</button><SaveButton busy={busy} label={user?'保存资料':'创建内置用户'}/></div>
 </form></Modal>;
}
function DeviceForm({device,onSave,onClose,busy,error}:{device:Device;onSave:(v:{name:string;room:string;hidden:boolean})=>void;onClose:()=>void;busy:boolean;error:string}){
 const [name,setName]=useState(device.name),[room,setRoom]=useState(device.room),[hidden,setHidden]=useState(!!device.hidden);
 return <Modal title="设备资料" onClose={onClose} busy={busy}><form onSubmit={e=>{e.preventDefault();onSave({name:name.trim(),room:room.trim(),hidden});}}>
  <div className={styles.fields}><label>显示名称<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>所在区域<input maxLength={40} value={room} onChange={e=>setRoom(e.target.value)}/></label></div>
  <label className={styles.check}><input type="checkbox" checked={hidden} onChange={e=>setHidden(e.target.checked)}/>从设备列表和场景中隐藏展示</label><p className={styles.muted}>隐藏展示不会撤销已有控制权限。管理界面仍会保留这台设备。</p>
  <dl className={styles.info}><dt>设备标识</dt><dd>{device.key}</dd><dt>提供方</dt><dd>{device.provider||'—'}</dd><dt>3D 场景</dt><dd>{linkedDevice(device.key)?'已关联':'未关联'}</dd><dt>支持操作</dt><dd>{Object.keys(device.actions||{}).join('、')||'暂未上报'}</dd></dl>
  <Notice text={error}/><div className={styles.modalActions}><button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>取消</button><SaveButton busy={busy} label="保存资料"/></div>
 </form></Modal>;
}
function AccessForm({row,subjectName,onPreview,onClose}:{row:AccessRow;subjectName:string;onPreview:(level:Level)=>void;onClose:()=>void}){
 const [level,setLevel]=useState<Level>(levelOf(row));
 return <Modal title="调整设备访问" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onPreview(level);}}><p>{subjectName} <ChevronRight size={14} className={styles.inlineIcon}/> {row.device.name}</p>
  <fieldset className={styles.radios}><legend>有效权限</legend>{(Object.keys(levels) as Level[]).map(value=><label key={value}><input type="radio" name="access" value={value} checked={level===value} onChange={()=>setLevel(value)} disabled={!row.grantable.read||((row.control||value==='control')&&!row.grantable.control)}/><span>{levels[value]}</span></label>)}</fieldset>
  <p className={styles.muted}>授予、撤销和降级都受你的权限范围限制。只读管理员不能更改控制权限。</p>
  <div className={styles.modalActions}><button type="button" className={styles.secondary} onClick={onClose}>取消</button><button className={styles.primary} type="submit" disabled={level===levelOf(row)||!row.grantable.read||((row.control||level==='control')&&!row.grantable.control)}>预览变更<ChevronRight size={15}/></button></div>
 </form></Modal>;
}
function CapabilitiesForm({value,grantable,onPreview,onClose}:{value:Record<Capability,boolean>;grantable:Record<Capability,boolean>;onPreview:(v:Record<Capability,boolean>)=>void;onClose:()=>void}){
 const [selected,setSelected]=useState({...value});
 return <Modal title="调整管理能力" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onPreview(selected);}}>{(Object.keys(capabilityNames) as Capability[]).map(key=><label key={key} className={styles.capability}><span>{capabilityNames[key]}</span><input type="checkbox" checked={selected[key]} disabled={!grantable[key]} onChange={e=>setSelected({...selected,[key]:e.target.checked})}/></label>)}<p className={styles.muted}>管理能力独立于设备访问。系统会保护最后一位已激活的权限管理员。</p><div className={styles.modalActions}><button className={styles.secondary} type="button" onClick={onClose}>取消</button><button className={styles.primary} type="submit" disabled={!(Object.keys(selected) as Capability[]).some(key=>selected[key]!==value[key])}>预览变更<ChevronRight size={15}/></button></div></form></Modal>;
}

type Editor={kind:'user';user?:User}|{kind:'device';device:Device}|{kind:'access';row:AccessRow}|{kind:'capabilities'};
type Confirmation={title:string;description:string;details?:string[];run:()=>Promise<unknown>};
export default function ManagementConsole({section:requested}:{section?:Section}){
 const [session,setSession]=useState<Session|null|undefined>(),[authError,setAuthError]=useState('');
 const [users,setUsers]=useState<User[]>([]),[devices,setDevices]=useState<Device[]>([]),[policies,setPolicies]=useState<Policy[]>([]),[access,setAccess]=useState<Access|null>(null);
 const [subject,setSubject]=useState('anonymous'),[tab,setTab]=useState<'devices'|'capabilities'>('devices'),[search,setSearch]=useState('');
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[editor,setEditor]=useState<Editor|null>(null),[confirm,setConfirm]=useState<Confirmation|null>(null);
 const generation=useRef(0),authGeneration=useRef(0);
 const caps=session?.capabilities||{};
 const section=requested||sections.find(key=>caps[key])||'users';
 const allowed=!!session&&!!caps[section];
 const reloadSession=useCallback(async()=>{
  const request=++authGeneration.current;
  if(!CONTROL_BASE){setSession(null);setAuthError('设备控制服务尚未配置。');return;}
  try{const me=await api<Session>('/auth/me');if(request===authGeneration.current){setSession(me);setAuthError('');}}
  catch(e){if(request===authGeneration.current){if(e instanceof ManagementError&&e.status===401){setSession(null);setAuthError('');}else{setSession(null);setAuthError(errorText(e));}}}
 },[]);
 useEffect(()=>{reloadSession();window.addEventListener('auth-change',reloadSession);return()=>{authGeneration.current++;window.removeEventListener('auth-change',reloadSession);};},[reloadSession]);
 const load=useCallback(async()=>{
  const request=++generation.current;if(!session?.capabilities?.[section])return;
  setLoading(true);setError('');
  try{
   if(section==='users'){const data=await api<{users:User[]}>('/admin/users');if(request===generation.current)setUsers(data.users);}
   if(section==='devices'){const data=await api<{devices:Device[]}>('/admin/devices');if(request===generation.current)setDevices(data.devices);}
   if(section==='permissions'){
    const query=new URLSearchParams({subject_kind:subject==='anonymous'?'anonymous':'user',subject_id:subject==='anonymous'?'':subject});
    const [people,data,rules]=await Promise.all([api<{users:User[]}>('/admin/subjects'),api<Access>('/admin/access?'+query),api<{policies:Policy[]}>('/admin/policies')]);
    if(request===generation.current){setUsers(people.users);setAccess(data);setPolicies(rules.policies);}
   }
  }catch(e){if(request===generation.current)setError(errorText(e));}
  finally{if(request===generation.current)setLoading(false);}
 },[session,section,subject]);
 useEffect(()=>{load();return()=>{generation.current++;};},[load]);
 async function perform(run:()=>Promise<unknown>,success:string){
  setBusy(true);setError('');setMessage('');
  try{await run();setEditor(null);setConfirm(null);setMessage(success);await load();window.dispatchEvent(new Event('auth-change'));}
  catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 const subjectName=subject==='anonymous'?'匿名访客':displayName(users.find(u=>u.id===subject));
 const chooseSubject=(id:string)=>{setSubject(id);setAccess(null);setEditor(null);setConfirm(null);setError('');};
 useEffect(()=>{if(!allowed){setEditor(null);setConfirm(null);setUsers([]);setDevices([]);setAccess(null);setPolicies([]);}},[allowed]);
 const userAction=(u:User,action:'toggle'|'revoke')=>{
  setEditor(null);setError('');
  setConfirm(action==='toggle'?{title:u.disabled?'启用内置用户':'停用内置用户',description:`${displayName(u)}${u.disabled?'将恢复登录资格，需要重新登录。':'将无法登录，现有会话也会立即失效。'}`,run:()=>api('/admin/users/'+encodeURIComponent(u.id),{disabled:!u.disabled},'PATCH')}:{title:'退出全部设备',description:`${displayName(u)}的全部登录会话将失效，需要重新登录。`,run:()=>api('/admin/users/'+encodeURIComponent(u.id)+'/revoke-sessions',{},'POST')});
 };
 const filteredUsers=users.filter(u=>(u.name+u.phone).toLowerCase().includes(search.toLowerCase()));
 return <div className={styles.container}>
  <div className={styles.breadcrumb}><Link href="/home/">家庭</Link><ChevronRight size={13}/><span>管理控制台</span></div>
  <div className={styles.shell}><aside className={styles.sidebar}><span className={styles.navLabel}>管理</span><nav aria-label="管理导航">{sections.filter(key=>caps[key]).map(key=>{const Icon=sectionIcons[key];return <Link key={key} href={'/manage/'+key+'/'} aria-current={section===key?'page':undefined}><Icon size={17}/>{titles[key]}</Link>;})}</nav><Link className={styles.back} href="/home/"><ArrowLeft size={15}/>返回院子</Link></aside>
  <main className={styles.main}>
   <header className={styles.heading}><div><span className={styles.eyebrow}>{hints[section]}</span><h1>{titles[section]}</h1></div>{allowed&&<div className={styles.actions}>{section==='users'&&<button className={styles.primary} onClick={()=>{setError('');setEditor({kind:'user'});}}><Plus size={16}/>新增内置用户</button>}{section==='devices'&&<button className={styles.secondary} disabled={busy} onClick={()=>perform(()=>api('/admin/devices/sync',{},'POST'),'设备已同步，本地资料已保留。')}><RefreshCw size={15} className={busy?styles.spinning:undefined}/>同步设备</button>}</div>}</header>
   {session===undefined?<div className={styles.empty}><LoaderCircle className={styles.spinning}/><p>正在确认管理权限…</p></div>:!session?<div className={styles.empty}><ShieldCheck size={30}/><h2>{authError?'暂时无法连接':'请先登录'}</h2><p>{authError||'使用管理员预先创建的内置账号登录。这里不开放注册。'}</p><button className={styles.primary} onClick={()=>authError?reloadSession():window.dispatchEvent(new Event('auth-open'))}>{authError?'重试':'登录内置账号'}</button></div>:!allowed?<div className={styles.empty}><ShieldCheck size={30}/><h2>没有此页面的管理权限</h2><p>请联系权限管理员。设备访问权限与管理能力独立。</p></div>:<>
   <div role="status" className={styles.message}>{message}</div>{!editor&&!confirm&&<Notice text={error}/>}
   {section==='users'&&<><div className={styles.toolbar}><label className={styles.search}><Search size={16}/><input aria-label="搜索用户" placeholder="搜索姓名或手机尾号" value={search} onChange={e=>setSearch(e.target.value)}/></label><span className={styles.muted}>{users.length} 位内置用户</span></div><div className={styles.tableWrap}><table><thead><tr><th>用户</th><th>激活状态</th><th>账号状态</th><th>操作</th></tr></thead><tbody>{filteredUsers.map(u=><tr key={u.id}><td><div className={styles.person}><Avatar name={displayName(u)} src={u.avatar}/><div><strong>{displayName(u)}</strong></div></div></td><td><span className={u.activated?styles.badge:styles.neutral}>{u.activated?'已激活':'未激活'}</span><small className={styles.desktop}>{u.activated?formatDate(u.activated_at):'等待首次验证登录'}</small></td><td><span className={u.disabled?styles.disabled:styles.muted}>{u.disabled?'已停用':'启用中'}</span></td><td><button className={styles.textButton} onClick={()=>{setError('');setEditor({kind:'user',user:u});}}>管理</button></td></tr>)}</tbody></table>{!loading&&!filteredUsers.length&&<p className={styles.emptyRow}>没有匹配的内置用户。</p>}</div></>}
   {section==='devices'&&<div className={styles.tableWrap}><table><thead><tr><th>设备</th><th>状态</th><th className={styles.desktop}>3D 关联</th><th>操作</th></tr></thead><tbody>{devices.map(d=><tr key={d.key}><td><strong>{d.name||d.key}</strong><small>{d.room||'未分区'} · {d.kind||'设备'}</small></td><td><span className={d.online&&!d.missing?styles.badge:styles.neutral}>{d.missing?'暂未发现':d.online?'在线':'离线'}</span>{d.hidden&&<small>已隐藏展示</small>}</td><td className={styles.desktop}><span className={styles.muted}>{linkedDevice(d.key)?<><Link2 size={14} className={styles.inlineIcon}/>已关联</>:'未关联'}</span></td><td><div className={styles.rowActions}><button className={styles.textButton} onClick={()=>{setError('');setEditor({kind:'device',device:d});}}>资料</button>{caps.permissions&&<Link className={styles.textButton} href="/manage/permissions/">权限</Link>}</div></td></tr>)}</tbody></table>{!loading&&!devices.length&&<p className={styles.emptyRow}>尚未发现设备。可尝试同步设备。</p>}</div>}
   {section==='permissions'&&<><div className={styles.toolbar}><SubjectSelect users={users} value={subject} onChange={chooseSubject} disabled={busy}/><div className={styles.tabs} role="tablist" aria-label="权限类型"><button role="tab" aria-selected={tab==='devices'} onClick={()=>setTab('devices')}>设备访问</button><button role="tab" aria-selected={tab==='capabilities'} onClick={()=>setTab('capabilities')}>管理能力</button></div></div>
   {access&&(tab==='devices'?<div className={styles.tableWrap}><table><thead><tr><th>设备</th><th>有效权限</th><th className={styles.desktop}>授权来源</th><th>操作</th></tr></thead><tbody>{access.devices.map(row=><tr key={row.device.key}><td><strong>{row.device.name||row.device.key}</strong><small>{row.device.room||'未分区'}</small></td><td><span className={row.read||row.control?styles.badge:styles.neutral}>{levels[levelOf(row)]}</span></td><td className={styles.desktop}><small>{!row.sources.length?'默认拒绝':row.sources.some(p=>p.resource.includes('*'))?'包含继承规则':'设备级规则'}</small></td><td><button className={styles.textButton} onClick={()=>{setError('');setEditor({kind:'access',row});}}>调整</button></td></tr>)}</tbody></table>{!access.devices.length&&<p className={styles.emptyRow}>暂无可管理的设备。</p>}</div>:subject==='anonymous'?<div className={styles.emptyRow}>匿名访客仅参与设备授权，不开放管理能力。</div>:<><div>{(Object.keys(capabilityNames) as Capability[]).map(key=><div className={styles.capability} key={key}><span>{capabilityNames[key]}</span><span className={access.capabilities[key]?styles.badge:styles.neutral}>{access.capabilities[key]?'已授权':'未授权'}</span></div>)}</div><button className={styles.secondary} onClick={()=>{setError('');setEditor({kind:'capabilities'});}}><SlidersHorizontal size={15}/>调整管理能力</button></>)}
   <details className={styles.ruleList}><summary>查看授权依据与规则</summary><p className={styles.muted}>显式拒绝优先。调整设备访问会替换该对象的设备级规则；更广范围的拒绝仍然生效。</p><div className={styles.tableWrap}><table><thead><tr><th>资源</th><th>操作／效果</th><th>操作</th></tr></thead><tbody>{policies.filter(p=>p.subject_kind===(subject==='anonymous'?'anonymous':'user')&&(p.subject_id||'')===(subject==='anonymous'?'':subject)).map(p=><tr key={p.id}><td><code>{p.resource}</code></td><td>{p.action} · {p.effect==='deny'?'拒绝':'允许'}</td><td><button className={styles.textButton} onClick={()=>setConfirm({title:'撤销授权规则',description:`撤销 ${subjectName} 的规则：${p.resource} ／ ${p.action} ／ ${p.effect==='deny'?'拒绝':'允许'}。其他匹配规则仍可能生效。`,run:()=>api('/admin/policies/'+encodeURIComponent(p.id),undefined,'DELETE')})}>撤销</button></td></tr>)}</tbody></table></div></details>
   </>}
   {loading&&<div className={styles.loading}><LoaderCircle size={16} className={styles.spinning}/>正在更新数据…</div>}
   </>}
  </main></div>
  {editor?.kind==='user'&&<UserForm user={editor.user} onToggle={()=>editor.user&&userAction(editor.user,'toggle')} onRevoke={()=>editor.user&&userAction(editor.user,'revoke')} busy={busy} error={error} onClose={()=>{setEditor(null);setError('');}} onSave={value=>perform(()=>api(editor.user?'/admin/users/'+encodeURIComponent(editor.user.id):'/admin/users',value,editor.user?'PATCH':'POST'),editor.user?'用户资料已保存。':'内置用户已创建，等待首次验证登录激活。')}/>}
  {editor?.kind==='device'&&<DeviceForm device={editor.device} busy={busy} error={error} onClose={()=>{setEditor(null);setError('');}} onSave={value=>perform(()=>api('/admin/devices/'+encodeURIComponent(editor.device.key),value,'PATCH'),'设备资料已保存。')}/>}
  {editor?.kind==='access'&&<AccessForm row={editor.row} subjectName={subjectName} onClose={()=>setEditor(null)} onPreview={level=>{const row=editor.row;setEditor(null);setConfirm({title:'确认设备权限变更',description:`${subjectName} · ${row.device.name}：${levels[levelOf(row)]} → ${levels[level]}。${subject==='anonymous'&&level!=='none'?'这会向所有未登录访客开放该设备的相应访问。':''}`,run:()=>api('/admin/access',{subject_kind:subject==='anonymous'?'anonymous':'user',subject_id:subject==='anonymous'?'':subject,device_key:row.device.key,access:level},'PUT')});}}/>}
  {editor?.kind==='capabilities'&&access&&<CapabilitiesForm value={access.capabilities} grantable={access.grantable_capabilities} onClose={()=>setEditor(null)} onPreview={next=>{const before=access.capabilities;setEditor(null);setConfirm({title:'确认管理能力变更',description:`调整 ${subjectName} 的管理能力。设备访问权限保持独立。`,details:(Object.keys(capabilityNames) as Capability[]).filter(key=>before[key]!==next[key]).map(key=>`${capabilityNames[key]}：${before[key]?'已授权':'未授权'} → ${next[key]?'已授权':'未授权'}`),run:()=>api('/admin/capabilities',{subject_id:subject,capabilities:Object.fromEntries((Object.keys(next) as Capability[]).filter(key=>before[key]!==next[key]).map(key=>[key,next[key]]))},'PUT')});}}/>}
  {confirm&&<Modal title={confirm.title} busy={busy} onClose={()=>{setConfirm(null);setError('');}}><p>{confirm.description}</p>{confirm.details&&<ul className={styles.diff}>{confirm.details.map(d=><li key={d}>{d}</li>)}</ul>}<Notice text={error}/><div className={styles.modalActions}><button className={styles.secondary} disabled={busy} onClick={()=>setConfirm(null)}>取消</button><button className={styles.primary} disabled={busy} onClick={()=>perform(confirm.run,'变更已生效。')}>{busy?'提交中…':'确认变更'}</button></div></Modal>}
 </div>;
}
