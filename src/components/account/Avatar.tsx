"use client";
import { useEffect, useRef, useState } from 'react';
import { loadAvatarImage } from '@/lib/avatar-image';
import AvatarCropDialog from './AvatarCropDialog';
import styles from './account.module.css';

export function Avatar({name='',src='',size=36}:{name?:string;src?:string;size?:number}){
 const [failed,setFailed]=useState('');
 return <span style={{display:'inline-flex',width:size,height:size,flexShrink:0,borderRadius:'50%',overflow:'hidden',alignItems:'center',justifyContent:'center',background:'var(--avatar-bg, #e4ebdf)',color:'var(--avatar-fg, #355d46)',fontSize:size*.4,fontWeight:500}} aria-hidden="true">
  {src && src!==failed ? <img src={src} alt="" width={size} height={size} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={()=>setFailed(src)}/> : (/^[+0-9]/.test(name.trim())?'人':Array.from(name.trim())[0]||'人')}
 </span>;
}
export function AvatarEditor({name,value,onChange,disabled=false,compact=false}:{name:string;value:string;onChange:(src:string)=>void|Promise<void>;disabled?:boolean;compact?:boolean}){
 const fileRef=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [source,setSource]=useState<HTMLCanvasElement|null>(null);
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const chooseImage=async (file:File)=>{
  setError('');setBusy(true);
  try{const image=await loadAvatarImage(file);if(mounted.current)setSource(image);}
  catch(error){if(mounted.current)setError(error instanceof Error?error.message:'头像更新失败，请重试。');}
  finally{if(mounted.current)setBusy(false);}
 };
 return <div><div className={styles.avatarEditor}><Avatar name={name} src={value} size={compact?40:64}/><div className={styles.avatarActions}>
  <button type="button" className={styles.smallButton} disabled={disabled||busy} onClick={()=>fileRef.current?.click()}>{busy?'处理图片…':compact?'更换头像':'上传头像'}</button>
  {value&&<button type="button" className={styles.quietButton} disabled={disabled||busy} onClick={async()=>{setBusy(true);setError('');try{await onChange('');}catch(e){setError(e instanceof Error?e.message:'头像更新失败');}finally{setBusy(false);}}}>移除头像</button>}
  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden style={{display:'none'}} aria-label="选择头像图片" disabled={disabled||busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void chooseImage(file);}}/>
 </div></div>{!compact&&<p className={styles.hint}>支持 JPG、PNG、WebP，可自行调整裁剪；大图会自动压缩。</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
 {source&&<AvatarCropDialog source={source} onSave={onChange} onClose={()=>setSource(null)}/>}</div>;
}
