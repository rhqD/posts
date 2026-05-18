"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Save } from "lucide-react";

type Profile = {
  id?: string;
  full_name: string;
  headline: string;
  bio: string;
  avatar_url: string;
  location: string;
  email: string;
  resume_url: string;
  social_links: {
    github?: string;
    linkedin?: string;
    twitter?: string;
    website?: string;
  };
};

type Skill = {
  id: string;
  name: string;
  category: string;
  proficiency: number;
  sort_order: number;
};

type Experience = {
  id: string;
  company: string;
  role: string;
  description: string;
  start_date: string;
  end_date: string;
  location: string;
  company_url: string;
  sort_order: number;
};

export default function BioAdminPage() {
  return (
    <div className="space-y-12">
      <h1 className="text-2xl font-bold">Profile Manager</h1>
      <ProfileEditor />
      <SkillsManager />
      <ExperiencesManager />
    </div>
  );
}

function ProfileEditor() {
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    headline: "",
    bio: "",
    avatar_url: "",
    location: "",
    email: "",
    resume_url: "",
    social_links: { github: "", linkedin: "", twitter: "", website: "" },
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/bio/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setProfile({
            ...data.profile,
            social_links: data.profile.social_links || { github: "", linkedin: "", twitter: "", website: "" },
          });
        }
      });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/bio/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (res.ok) setMessage("Saved!");
    else setMessage("Error saving.");
    setSaving(false);
  }, [profile]);

  const update = (field: string, value: string) => {
    if (field.startsWith("social_")) {
      const key = field.replace("social_", "");
      setProfile((p) => ({ ...p, social_links: { ...p.social_links, [key]: value } }));
    } else {
      setProfile((p) => ({ ...p, [field]: value }));
    }
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Profile</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          ["full_name", "Full Name"],
          ["headline", "Headline"],
          ["location", "Location"],
          ["email", "Email"],
          ["avatar_url", "Avatar URL"],
          ["resume_url", "Resume URL"],
        ].map(([field, label]) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <input
              type="text"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value={(profile as any)[field]}
              onChange={(e) => update(field, e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        ))}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Bio</label>
          <textarea
            rows={4}
            value={profile.bio}
            onChange={(e) => update("bio", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        {(["github", "linkedin", "twitter", "website"] as const).map((key) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{key}</label>
            <input
              type="text"
              value={profile.social_links[key]}
              onChange={(e) => update(`social_${key}`, e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save Profile"}
        </button>
        {message && <span className="text-sm text-green-600">{message}</span>}
      </div>
    </section>
  );
}

function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkill, setNewSkill] = useState({ name: "", category: "General", proficiency: 50 });

  useEffect(() => {
    fetch("/api/bio/skills")
      .then((r) => r.json())
      .then((data) => setSkills(data.skills || []));
  }, []);

  const add = async () => {
    const res = await fetch("/api/bio/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newSkill, sort_order: skills.length }),
    });
    if (res.ok) {
      const data = await res.json();
      setSkills((prev) => [...prev, data.skill]);
      setNewSkill({ name: "", category: "General", proficiency: 50 });
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/bio/skills/${id}`, { method: "DELETE" });
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Skills</h2>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Skill name"
          value={newSkill.name}
          onChange={(e) => setNewSkill((s) => ({ ...s, name: e.target.value }))}
          className="flex-1 min-w-[150px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <input
          type="text"
          placeholder="Category"
          value={newSkill.category}
          onChange={(e) => setNewSkill((s) => ({ ...s, category: e.target.value }))}
          className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={newSkill.proficiency}
          onChange={(e) => setNewSkill((s) => ({ ...s, proficiency: parseInt(e.target.value) || 0 }))}
          className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        <button
          onClick={add}
          disabled={!newSkill.name}
          className="inline-flex items-center gap-1 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {skills.length === 0 ? (
        <p className="text-sm text-gray-400">No skills yet.</p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <span className="text-sm font-medium">{skill.name}</span>
                <span className="ml-2 text-xs text-gray-400">{skill.category} — {skill.proficiency}%</span>
              </div>
              <button onClick={() => remove(skill.id)} className="text-red-400 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ExperiencesManager() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [newExp, setNewExp] = useState({
    company: "",
    role: "",
    description: "",
    start_date: "",
    end_date: "",
    location: "",
    company_url: "",
  });

  useEffect(() => {
    fetch("/api/bio/experiences")
      .then((r) => r.json())
      .then((data) => setExperiences(data.experiences || []));
  }, []);

  const add = async () => {
    const res = await fetch("/api/bio/experiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newExp,
        end_date: newExp.end_date || null,
        sort_order: experiences.length,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setExperiences((prev) => [...prev, data.experience]);
      setNewExp({ company: "", role: "", description: "", start_date: "", end_date: "", location: "", company_url: "" });
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/bio/experiences/${id}`, { method: "DELETE" });
    setExperiences((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Experience</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {[
          ["company", "Company"],
          ["role", "Role"],
          ["location", "Location"],
          ["company_url", "Company URL"],
          ["start_date", "Start Date"],
          ["end_date", "End Date (leave empty for Present)"],
        ].map(([field, label]) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
            <input
              type={field.includes("date") ? "date" : "text"}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value={(newExp as any)[field]}
              onChange={(e) => setNewExp((exp) => ({ ...exp, [field]: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
        ))}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea
            rows={3}
            value={newExp.description}
            onChange={(e) => setNewExp((exp) => ({ ...exp, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
      </div>
      <button
        onClick={add}
        disabled={!newExp.company || !newExp.role || !newExp.start_date}
        className="inline-flex items-center gap-1 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
      >
        <Plus size={14} /> Add Experience
      </button>

      {experiences.length === 0 ? (
        <p className="text-sm text-gray-400 mt-4">No experiences yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {experiences.map((exp) => (
            <div key={exp.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <span className="text-sm font-medium">{exp.role} at {exp.company}</span>
                <span className="ml-2 text-xs text-gray-400">
                  {exp.start_date} — {exp.end_date || "Present"}
                </span>
              </div>
              <button onClick={() => remove(exp.id)} className="text-red-400 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
