"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/account/Avatar';
import { userName } from '@/lib/control';
import type { User } from '@/lib/manage';
import styles from './subject-select.module.css';

type Option = { value: string; name: string; avatar?: string; status: string; disabled?: boolean };

export default function SubjectSelect({ users, value, onChange, disabled = false }: {
  users: User[]; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const typed = useRef({ value: '', at: 0 });
  const options: Option[] = [
    { value: 'anonymous', name: '匿名访客', status: '未登录的访问者' },
    ...users.map(user => ({ value: user.id, name: userName(user), avatar: user.avatar, status: user.disabled ? '已停用' : user.activated ? '已激活' : '未激活', disabled: user.disabled })),
  ];
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = options[selectedIndex] || { value, name: '用户不可用', status: '请重新选择' };

  function show(index = Math.max(0, selectedIndex)) { setActive(index); setOpen(true); }
  function select(index: number) {
    const option = options[index];
    if (!option) return;
    setOpen(false); trigger.current?.focus();
    if (option.value !== value) onChange(option.value);
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show(selectedIndex < 0 ? (event.key === 'ArrowUp' ? options.length - 1 : 0) : selectedIndex);
      else setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if ((event.key === 'Home' || event.key === 'End') && open) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (open) select(active); else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now(); typed.current = { value: (now - typed.current.at < 600 ? typed.current.value : '') + event.key, at: now };
      const index = options.findIndex(option => option.name.toLocaleLowerCase().startsWith(typed.current.value.toLocaleLowerCase()));
      if (index >= 0) { event.preventDefault(); show(index); }
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
      const width = Math.min(320, window.innerWidth - 32);
      const below = window.innerHeight - rect.bottom - 16, above = rect.top - 16;
      const upwards = below < Math.min(320, options.length * 56 + 48) && above > below;
      setPosition({ width, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), maxHeight: Math.max(80, Math.min(360, (upwards ? above : below) - 8)), ...(upwards ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) });
    }
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss, true); document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('focusin', dismiss); };
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, id]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function portrait(option: Option) {
    return option.value === 'anonymous' ? <span className={styles.guest}><UsersRound size={16}/></span> : <Avatar name={option.name} src={option.avatar} size={30}/>;
  }
  return <div className={styles.root} ref={root}>
    <span id={`${id}-label`} className={styles.label}>授权对象</span>
    <button type="button" role="combobox" ref={trigger} className={styles.trigger} aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled} onKeyDown={onKeyDown} onClick={() => open ? setOpen(false) : show()}>
      {portrait(selected)}<span className={styles.name} id={`${id}-value`}>{selected.name}</span>
      {selected.value !== 'anonymous' && <span className={styles.status} data-disabled={selected.disabled || undefined}>{selected.status}</span>}
      <ChevronDown size={15} className={styles.chevron} aria-hidden="true"/>
    </button>
    {open && createPortal(<div ref={popup} className={styles.popup} style={position}>
      <div className={styles.popupHeading}>选择授权对象</div>
      <ul role="listbox" id={`${id}-list`} aria-labelledby={`${id}-label`}>
        {options.map((option, index) => <li role="option" id={`${id}-option-${index}`} key={option.value} aria-selected={value === option.value} className={styles.option} data-active={index === active || undefined} data-guest={index === 0 || undefined} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => select(index)}>
          {portrait(option)}<span className={styles.optionCopy}><span className={styles.name}>{option.name}</span>{index === 0 && <span className={styles.guestHint}>{option.status}</span>}</span>
          {index !== 0 && <span className={styles.status} data-disabled={option.disabled || undefined}>{option.status}</span>}
          <span className={styles.check}>{value === option.value && <Check size={15}/>}</span>
        </li>)}
      </ul>
    </div>, document.body)}
  </div>;
}
