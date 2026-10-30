import type { Metadata } from "next";
import PageWrapper from "@/components/layout/PageWrapper";

export const metadata: Metadata = {
  title: "Privacy Policy | Renhanquan",
  description: "Privacy policy for renhanquan.com and personal tools built by Renhanquan.",
};

const updated = "October 30, 2026";

export default function PrivacyPage() {
  return (
    <PageWrapper>
      <div className="mb-10 pb-8" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-accent)" }}>
          Legal
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight leading-tight mb-3"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-serif)" }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Last updated: {updated}
        </p>
      </div>

      <div className="space-y-6 text-[15px] leading-7" style={{ color: "var(--color-text)" }}>
        <p>
          This policy covers <strong>renhanquan.com</strong> and the personal automation tools that
          the site owner operates for his own use, including a self-hosted assistant that connects to
          his own Google account (the &quot;App&quot;).
        </p>

        <h2 className="text-xl font-semibold pt-4">1. Whose data is processed</h2>
        <p>
          The App is not offered to the public. It runs on the owner&apos;s own devices and acts only on
          the owner&apos;s own Google account. No third-party user signs in, and no third-party user data
          is collected, stored, or processed.
        </p>

        <h2 className="text-xl font-semibold pt-4">2. What the App accesses</h2>
        <p>With the owner&apos;s explicit OAuth consent, the App may read and write:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Gmail messages (search, read, send, labels)</li>
          <li>Google Calendar events (list, create, delete)</li>
          <li>Google Drive files (search, upload, download, share)</li>
          <li>Google Sheets and Google Docs (read, create, edit)</li>
          <li>Google Contacts (read only)</li>
        </ul>
        <p>
          Access is limited to the scopes granted on the Google consent screen and can be revoked at
          any time at{" "}
          <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h2 className="text-xl font-semibold pt-4">3. How data is stored</h2>
        <p>
          OAuth credentials and any cached content stay on the owner&apos;s local machines, protected by
          the operating system&apos;s file permissions and full-disk encryption. Google user data is
          never sold, never used for advertising, and never transferred to third parties. It is not
          used to train machine-learning models.
        </p>

        <h2 className="text-xl font-semibold pt-4">4. Third-party services</h2>
        <p>
          Requests to Google APIs go directly from the owner&apos;s machine to Google. The App may use a
          hosting provider (Vercel) and a database provider (Supabase) to serve this website; those
          providers process only ordinary web request data such as IP address and user agent.
        </p>

        <h2 className="text-xl font-semibold pt-4">5. Website visitors</h2>
        <p>
          This site sets no advertising cookies and runs no third-party tracking scripts. Server logs
          may record standard request metadata for security and debugging, and are deleted on a rolling
          basis.
        </p>

        <h2 className="text-xl font-semibold pt-4">6. Data retention and deletion</h2>
        <p>
          The owner can delete all locally stored credentials and cached data at any time by removing
          the App&apos;s token files and revoking access in his Google account. Because the App serves a
          single user, deletion requests are handled immediately by that user.
        </p>

        <h2 className="text-xl font-semibold pt-4">7. Changes</h2>
        <p>
          Material changes to this policy will be posted on this page with an updated date.
        </p>

        <h2 className="text-xl font-semibold pt-4">8. Contact</h2>
        <p>
          Questions about this policy:{" "}
          <a className="underline" href="mailto:eng-123@qq.com">
            eng-123@qq.com
          </a>
          .
        </p>
      </div>
    </PageWrapper>
  );
}
