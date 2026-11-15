import ManagementConsole from '@/components/manage/ManagementConsole';
export const metadata = { title: 'users · 家庭控制台', robots: { index: false, follow: false } };
export default function Page() { return <ManagementConsole section="users" />; }
