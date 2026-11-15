"use client";
import { useRef, useState } from 'react';
import styles from './account.module.css';

export function Avatar({name='',src='',size=36}:{name?:string;src?:string;size?:number}){
 const [failed,setFailed]=useState('');
 return <span style={{display:'inline-flex',width:size,height:size,flexShrink:0,borderRadius:'50%',overflow:'hidden',alignItems:'center',justifyContent:'center',background:'var(--avatar-bg, #e4ebdf)',color:'var(--avatar-fg, #355d46)',fontSize:size*.4,fontWeight:500}} aria-hidden="true">
  {src && src!==failed ? <img src={src} alt="" width={size} height={size} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={()=>setFailed(src)}/> : (/^[+0-9]/.test(name.trim())?'人':Array.from(name.trim())[0]||'人')}
 </span>;
}
export async function prepareAvatar(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片。');
 if(file.size>5*1024*1024)throw new Error('图片请控制在 5 MB 以内。');
 const bitmap=await createImageBitmap(file);
 try{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d');if(!context)throw new Error('当前浏览器无法处理图片。');
  const edge=Math.min(bitmap.width,bitmap.height);context.fillStyle='#eef1e9';context.fillRect(0,0,256,256);
  context.drawImage(bitmap,(bitmap.width-edge)/2,(bitmap.height-edge)/2,edge,edge,0,0,256,256);
  return canvas.toDataURL('image/jpeg',.85);
 }finally{bitmap.close();}
}
export function AvatarEditor({name,value,onChange,disabled=false,compact=false}:{name:string;value:string;onChange:(src:string)=>void|Promise<void>;disabled?:boolean;compact?:boolean}){
 const fileRef=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div><div className={styles.avatarEditor}><Avatar name={name} src={value} size={compact?40:64}/><div className={styles.avatarActions}>
  <button type="button" className={styles.smallButton} disabled={disabled||busy} onClick={()=>fileRef.current?.click()}>{busy?'处理图片…':compact?'更换头像':'上传头像'}</button>
  {value&&<button type="button" className={styles.quietButton} disabled={disabled||busy} onClick={()=>{setBusy(true);setError('');Promise.resolve(onChange('')).catch(e=>setError(e instanceof Error?e.message:'头像更新失败')).finally(()=>setBusy(false));}}>移除头像</button>}
  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden style={{display:'none'}} aria-label="选择头像图片" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setError('');setBusy(true);try{await onChange(await prepareAvatar(file));}catch(err){setError(err instanceof Error?err.message:'头像更新失败，请重试。');}finally{setBusy(false);}}}/>
 </div></div>{!compact&&<p className={styles.hint}>JPG、PNG、WebP，最多 5 MB；照片会居中裁成正方形。</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}</div>;
}
