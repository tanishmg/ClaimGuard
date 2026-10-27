"use client";

import { useEffect, useMemo, useState } from "react";
import { Instrument_Sans, Newsreader } from "next/font/google";
import {
  LayoutDashboard, FileText, ShieldCheck, Users, Search, Plus, X,
  Download, Check, Ban, Flag, Bell,
} from "lucide-react";

const sans = Instrument_Sans({ subsets: ["latin"] });
const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"] });

type ClaimStatus = "Under review" | "Flagged" | "Approved" | "Rejected";
type Risk = "Low" | "Medium" | "High";
type Claim = {
  id: string;
  claimant: string;
  type: string;
  date: string;
  amount: number;
  status: ClaimStatus;
  risk: Risk;
};
type Policy = {
  id: number;
  holderId: number;
  holderName: string;
  type: "medical" | "auto" | "property";
  coverageAmount: number;
  startDate: string;
  endDate: string;
  status: "active" | "expired" | "cancelled";
};


const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "All claims", icon: FileText },
  { label: "Fraud review", icon: ShieldCheck },
  { label: "Policyholders", icon: Users },
];

// Status colours: dot + text. Risk colours: meter fill.
const statusStyle: Record<ClaimStatus, { dot: string; bar: string }> = {
  "Under review": { dot: "bg-[#B7791F]", bar: "bg-[#D9A441]" },
  Flagged: { dot: "bg-[#C2410C]", bar: "bg-[#C2410C]" },
  Approved: { dot: "bg-[#2F7D4F]", bar: "bg-[#2F7D4F]" },
  Rejected: { dot: "bg-[#8A968F]", bar: "bg-[#B8C1BC]" },
};
const riskLevel: Record<Risk, number> = { Low: 1, Medium: 2, High: 3 };
const riskFill: Record<Risk, string> = { Low: "bg-[#2F7D4F]", Medium: "bg-[#D9A441]", High: "bg-[#C2410C]" };

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function StatusLabel({ status }: { status: ClaimStatus }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-[#16231F]">
      <span className={`h-2 w-2 rounded-full ${statusStyle[status].dot}`} />
      {status}
    </span>
  );
}

function RiskMeter({ risk }: { risk: Risk }) {
  return (
    <span className="inline-flex items-center gap-2" title={`${risk} risk`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map(i => (
          <span key={i} className={`h-4 w-1.5 rounded-sm ${i <= riskLevel[risk] ? riskFill[risk] : "bg-[#DDE3DF]"}`} />
        ))}
      </span>
      <span className="text-sm text-[#44534C]">{risk}</span>
    </span>
  );
}

export default function Home() {
  
const [claims, setClaims] = useState<Claim[]>([]);
const [policies, setPolicies] = useState<Policy[]>([]);
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState("");
const [uploadedDocumentId, setUploadedDocumentId] = useState("");

useEffect(() => {
  let cancelled = false;

  async function loadClaims() {
    try {
      setLoading(true);
      setLoadError("");

      const response = await fetch("/api/claims");

      if (!response.ok) {
        throw new Error(`Failed to load claims (${response.status})`);
      }

      const data: { claims: Claim[] } = await response.json();

      if (!cancelled) {
        setClaims(data.claims);
      }
    } catch (error) {
      if (!cancelled) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load claims."
        );
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  }

  loadClaims();

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  async function loadPolicies() {
    try {
      const response = await fetch("/api/policies");

      if (!response.ok) {
        throw new Error("Failed to load policies");
      }

      const data: { policies: Policy[] } = await response.json();
      setPolicies(data.policies);
    } catch (error) {
      console.error("Failed to load policies:", error);
    }
  }

  loadPolicies();
}, []);


  const [activeNav, setActiveNav] = useState("Overview");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadedDocumentClaimId, setUploadedDocumentClaimId] = useState("");
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [notice, setNotice] = useState("");
  const [newClaim, setNewClaim] = useState({
  claimant: "",
  type: "Medical",
  amount: "",
  policyId: "",
  incidentDate: "",
});

  const count = (s: ClaimStatus) => claims.filter(c => c.status === s).length;
  const flagged = claims.filter(c => c.status === "Flagged");
  const exposure = flagged.reduce((sum, c) => sum + c.amount, 0);
  const selected = claims.find(c => c.id === selectedId) ?? null;

  const filtered = useMemo(() => claims.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = [c.id, c.claimant, c.type, c.status].some(v => v.toLowerCase().includes(q));
    const matchFilter = filter === "All" || c.status === filter;
    const matchNav = activeNav !== "Fraud review" || c.status === "Flagged";
    return matchSearch && matchFilter && matchNav;
  }), [claims, search, filter, activeNav]);

  function setStatus(id: string, status: ClaimStatus) {
    setClaims(prev => prev.map(c => (c.id === id ? { ...c, status } : c)));
    setNotice(`Claim ${id} marked as ${status.toLowerCase()}. Sample data only, not saved.`);
  }

async function submitClaim(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const policyId = Number(newClaim.policyId);
  const amount = Number(newClaim.amount);
  const incidentDate = newClaim.incidentDate;
  const claimType = newClaim.type.toLowerCase();

  if (
  !Number.isInteger(policyId) ||
  policyId <= 0 ||
  !Number.isFinite(amount) ||
  amount <= 0 ||
  !incidentDate
) {
  setNotice("Please select a policy, incident date, and valid claim amount.");
  return;
}

  try {
    setNotice("");

    const response = await fetch("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policyId,
        amount,
        incidentDate,
        type: claimType,
      }),
    });

    const data = await response.json();
    
    

    if (!response.ok) {
      setNotice(data.error || "Could not save the claim.");
      return;
    }

    const claimsResponse = await fetch("/api/claims");

    if (!claimsResponse.ok) {
      throw new Error("Claim saved, but the dashboard could not refresh.");
    }

    const claimsData = await claimsResponse.json();
    setClaims(claimsData.claims);

    setShowNewClaim(false);
    setNewClaim({
      claimant: "",
      type: "Medical",
      amount: "",
      policyId: "",
      incidentDate: "",
    });

    setActiveNav("All claims");
    setFilter("All");
    setSearch("");
    setNotice("Claim saved successfully to MySQL.");
  } catch (error) {
    setNotice(
      error instanceof Error
        ? error.message
        : "Something went wrong while saving the claim."
    );
  }
}

  const title =
    activeNav === "Overview" ? "Today’s claims desk" : activeNav === "Fraud review" ? "Fraud review queue" : activeNav;

  const figures = [
    { label: "Total claims", value: claims.length, tone: "text-[#16231F]" },
    { label: "Awaiting review", value: count("Under review"), tone: "text-[#B7791F]" },
    { label: "Flagged", value: count("Flagged"), tone: "text-[#C2410C]" },
    { label: "Approved", value: count("Approved"), tone: "text-[#2F7D4F]" },
  ];

  const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5C55]";

  return (
    <div className={`${sans.className} min-h-screen bg-[#F2F4F1] text-[#16231F] lg:flex`}>
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0F2A27] text-[#C9D8D3] lg:flex">
        <div className="flex h-20 items-center gap-3 px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#E8F0EC] text-[#0F2A27]"><ShieldCheck size={20} /></span>
          <div>
            <p className={`${serif.className} text-xl font-semibold leading-none text-white`}>ClaimGuard</p>
            <p className="mt-1 text-xs text-[#8FA9A1]">Claims and fraud desk</p>
          </div>
        </div>
        <nav className="mt-4 flex-1 px-3" aria-label="Main">
          {navItems.map(({ label, icon: Icon }) => {
            const active = activeNav === label;
            return (
              <button key={label} onClick={() => { setActiveNav(label); setFilter("All"); setSelectedId(null); }}
                className={`${focus} mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${active ? "bg-[#E8F0EC] font-semibold text-[#0F2A27]" : "hover:bg-white/10 hover:text-white"}`}>
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {label === "Fraud review" && flagged.length > 0 && (
                  <span className={`rounded px-1.5 text-xs font-semibold ${active ? "bg-[#C2410C] text-white" : "bg-[#C2410C]/90 text-white"}`}>{flagged.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-5">
          <p className="text-xs leading-5 text-[#8FA9A1]">Prototype with sample data. Database connection comes next.</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1F4A44] text-sm font-semibold text-white">AD</span>
            <div><p className="text-sm font-medium text-white">Admin Demo</p><p className="text-xs text-[#8FA9A1]">Administrator</p></div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile nav */}
        <div className="flex items-center gap-1 overflow-x-auto bg-[#0F2A27] px-3 py-2 lg:hidden">
          {navItems.map(({ label }) => (
            <button key={label} onClick={() => { setActiveNav(label); setFilter("All"); setSelectedId(null); }}
              className={`${focus} whitespace-nowrap rounded-md px-3 py-2 text-sm ${activeNav === label ? "bg-[#E8F0EC] font-semibold text-[#0F2A27]" : "text-[#C9D8D3]"}`}>{label}</button>
          ))}
        </div>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h1 className={`${serif.className} text-4xl font-medium tracking-tight sm:text-5xl`}>{title}</h1>
              {activeNav !== "Policyholders" && (
                <p className="mt-3 text-base leading-7 text-[#44534C]">
                  {flagged.length > 0
                    ? <><b className="font-semibold text-[#C2410C]">{flagged.length} claims</b> are flagged for fraud review, with <b className="font-semibold text-[#16231F]">{money(exposure)}</b> at stake.</>
                    : "No claims are flagged right now."}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setNotice(`${flagged.length} claims are flagged for review.`)} aria-label="Notifications"
                className={`${focus} relative rounded-md border border-[#CBD3CE] bg-white p-2.5 hover:bg-[#E8EDEA]`}>
                <Bell size={18} />
                {flagged.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#C2410C]" />}
              </button>
              <button onClick={() => setShowNewClaim(true)}
                className={`${focus} inline-flex items-center gap-2 rounded-md bg-[#0F5C55] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4A44]`}>
                <Plus size={17} /> Add claim
              </button>
            </div>
          </div>

          {activeNav === "Policyholders" ? (
            <section className="mt-10 rounded-lg border border-dashed border-[#B9C4BE] p-12 text-center">
              <Users className="mx-auto text-[#0F5C55]" size={30} />
              <p className="mt-3 font-semibold">No policyholder data yet</p>
              <p className="mt-1 text-sm text-[#44534C]">Connect MySQL to list policyholders here.</p>
            </section>
          ) : (
            <>
              {/* Summary band: figures + one status bar */}
              {activeNav !== "Fraud review" && (
                <section className="mt-8 rounded-lg border border-[#D5DCD8] bg-white" aria-label="Summary">
                  <dl className="grid grid-cols-2 divide-x divide-y divide-[#E3E8E5] sm:grid-cols-4 sm:divide-y-0">
                    {figures.map(f => (
                      <div key={f.label} className="px-5 py-5">
                        <dt className="text-sm text-[#5A6A63]">{f.label}</dt>
                        <dd className={`${serif.className} mt-1 text-5xl font-medium tabular-nums ${f.tone}`}>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="border-t border-[#E3E8E5] px-5 py-4">
                    <div className="flex h-3 overflow-hidden rounded-full bg-[#E3E8E5]" role="img"
                      aria-label={`Status split: ${count("Approved")} approved, ${count("Under review")} under review, ${count("Flagged")} flagged, ${count("Rejected")} rejected`}>
                      {(["Approved", "Under review", "Flagged", "Rejected"] as ClaimStatus[]).map(s => (
                        <div key={s} className={statusStyle[s].bar} style={{ width: `${claims.length ? (count(s) / claims.length) * 100 : 0}%` }} />
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                      {(["Approved", "Under review", "Flagged", "Rejected"] as ClaimStatus[]).map(s => (
                        <span key={s} className="inline-flex items-center gap-2 text-xs text-[#5A6A63]">
                          <span className={`h-2 w-2 rounded-full ${statusStyle[s].dot}`} />{s} {count(s)}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Claims table */}
              <section className="mt-8" aria-label="Claims">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 className={`${serif.className} text-2xl font-medium`}>{activeNav === "Fraud review" ? "Flagged claims" : "Recent claims"}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                      <span className="sr-only">Search claims</span>
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7A74]" />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID"
                        className={`${focus} w-56 rounded-md border border-[#CBD3CE] bg-white py-2 pl-9 pr-3 text-sm placeholder:text-[#8A968F]`} />
                    </label>
                    <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status"
                      className={`${focus} rounded-md border border-[#CBD3CE] bg-white px-3 py-2 text-sm`}>
                      <option value="All">All statuses</option>
                      <option>Under review</option><option>Flagged</option><option>Approved</option><option>Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-[#D5DCD8] bg-white">
                  <table className="w-full min-w-[760px] text-left">
                    <thead>
                      <tr className="border-b border-[#D5DCD8] bg-[#F7F9F7] text-sm text-[#5A6A63]">
                        {["Claim", "Claimant", "Type", "Amount", "Risk", "Status"].map(h => (
                          <th key={h} scope="col" className={`px-5 py-3 font-medium ${h === "Amount" ? "text-right" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E8E5]">
                      {filtered.map(c => (
                        <tr key={c.id} onClick={() => setSelectedId(c.id)}
                          className={`cursor-pointer transition-colors hover:bg-[#F2F6F4] ${selectedId === c.id ? "bg-[#E8F0EC]" : ""}`}>
                          <td className="whitespace-nowrap px-5 py-4">
                            <button onClick={e => { e.stopPropagation(); setSelectedId(c.id); }} className={`${focus} rounded text-sm font-semibold text-[#0F5C55] underline-offset-2 hover:underline`}>{c.id}</button>
                            <p className="mt-0.5 text-xs text-[#6B7A74]">{c.date}</p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm font-medium">{c.claimant}</td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-[#44534C]">{c.type}</td>
                          <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold tabular-nums">{money(c.amount)}</td>
                          <td className="px-5 py-4"><RiskMeter risk={c.risk} /></td>
                          <td className="px-5 py-4"><StatusLabel status={c.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
{loading ? (
  <div className="p-12 text-center text-sm text-[#5A6A63]">
    Loading claims from MySQL...
  </div>
) : loadError ? (
  <div className="p-12 text-center">
    <p className="font-medium text-red-700">
      Could not load claims
    </p>
    <p className="mt-1 text-sm text-[#5A6A63]">
      {loadError}
    </p>
    <button
      onClick={() => window.location.reload()}
      className="mt-3 rounded-md border border-[#CBD3CE] px-3 py-2 text-sm"
    >
      Try again
    </button>
  </div>
) : filtered.length === 0 ? (
  <div className="p-12 text-center">
    <p className="font-medium">
      {claims.length === 0 ? "No claims yet" : "No claims match"}
    </p>
    <p className="mt-1 text-sm text-[#5A6A63]">
      {claims.length === 0
        ? "Add a claim to get started."
        : "Clear the search or choose All statuses."}
    </p>
  </div>
) : null}

                  <div className="flex items-center justify-between border-t border-[#E3E8E5] px-5 py-3">
                    <p className="text-sm text-[#5A6A63]">Showing {filtered.length} of {claims.length} claims</p>
                    <button onClick={() => setNotice("Export will use real database records in a later build.")}
                      className={`${focus} inline-flex items-center gap-2 rounded-md border border-[#CBD3CE] px-3 py-1.5 text-sm font-medium hover:bg-[#E8EDEA]`}>
                      <Download size={15} /> Export report
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {/* Detail drawer with working decisions */}
      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-[#0F2A27]/40" onClick={() => setSelectedId(null)}>
          <aside role="dialog" aria-label="Claim details" onClick={e => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#0F5C55]">{selected.id}</p>
                <h2 className={`${serif.className} mt-1 text-3xl font-medium`}>{selected.claimant}</h2>
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Close details" className={`${focus} rounded-md p-2 hover:bg-[#E8EDEA]`}><X size={20} /></button>
            </div>

            <p className={`${serif.className} mt-6 text-4xl font-medium tabular-nums`}>{money(selected.amount)}</p>
            <p className="mt-1 text-sm text-[#5A6A63]">{selected.type} claim filed {selected.date}</p>
            <div className="mt-6">
  
<label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#183D32] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#285747]">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" x2="12" y1="3" y2="15" />
  </svg>

  Upload supporting document

  <input
    type="file"
    accept=".pdf,.jpg,.jpeg,.png"
    className="hidden"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("claimId", selected.id);

      try {
        const response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (response.ok && data.documentId) {
  setUploadedDocumentId(data.documentId);
  setUploadedDocumentClaimId(selected.id);
}

        setNotice(
          response.ok
            ? "Document uploaded successfully."
            : data.error || "Upload failed."
        );
      } catch {
        setNotice("Could not upload the document.");
      } finally {
        e.target.value = "";
      }
    }}
  />
</label>


<button
  type="button"
  disabled={
  !uploadedDocumentId ||
  uploadedDocumentClaimId !== selected.id
}
  onClick={async () => {
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: selected.id,
          documentId: uploadedDocumentId,
        }),
      });

      const data = await response.json();

      setNotice(
        response.ok
          ? `${data.result}: ${data.reason}`
          : data.error || "Verification failed."
      );
    } catch {
      setNotice("Could not verify the document.");
    }
  }}
  className="mt-6 block rounded-xl border border-[#183D32] px-4 py-3 text-sm font-medium text-[#183D32] transition hover:bg-[#EAF0EC] disabled:cursor-not-allowed disabled:opacity-40"
>
  Verify document
</button>


  <p className="mt-2 text-xs text-[#5A6A63]">
    PDF, JPG, or PNG. Maximum size: 5 MB.
  </p>
</div>

            <dl className="mt-6 divide-y divide-[#E3E8E5] border-y border-[#E3E8E5] text-sm">
              <div className="flex items-center justify-between py-3"><dt className="text-[#5A6A63]">Status</dt><dd><StatusLabel status={selected.status} /></dd></div>
              <div className="flex items-center justify-between py-3"><dt className="text-[#5A6A63]">Risk</dt><dd><RiskMeter risk={selected.risk} /></dd></div>
            </dl>

            {selected.status === "Flagged" && (
              <p className="mt-5 rounded-md border-l-4 border-[#C2410C] bg-[#FBEFE8] p-3 text-sm leading-6 text-[#7A2E0A]">
                Flagged for review. This is a sample flag and not a fraud finding.
              </p>
            )}

            <div className="mt-auto pt-8">
              <p className="mb-3 text-sm font-medium">Decision</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setStatus(selected.id, "Approved")} className={`${focus} flex items-center justify-center gap-1.5 rounded-md bg-[#2F7D4F] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#256340]`}><Check size={16} />Approve</button>
                <button onClick={() => setStatus(selected.id, "Flagged")} className={`${focus} flex items-center justify-center gap-1.5 rounded-md border border-[#C2410C] px-3 py-2.5 text-sm font-semibold text-[#C2410C] hover:bg-[#FBEFE8]`}><Flag size={16} />Flag</button>
                <button onClick={() => setStatus(selected.id, "Rejected")} className={`${focus} flex items-center justify-center gap-1.5 rounded-md border border-[#CBD3CE] px-3 py-2.5 text-sm font-semibold hover:bg-[#E8EDEA]`}><Ban size={16} />Reject</button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* New claim dialog */}
      {showNewClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2A27]/50 p-4">
          <form onSubmit={submitClaim} role="dialog" aria-label="Add claim" className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`${serif.className} text-2xl font-medium`}>Add a claim</h2>
                <p className="mt-1 text-sm text-[#5A6A63]">
  Submit a claim against an active policy for verification.
</p>
              </div>
              <button type="button" onClick={() => setShowNewClaim(false)} aria-label="Close form" className={`${focus} rounded-md p-2 hover:bg-[#E8EDEA]`}><X size={20} /></button>
            </div>
            <div className="mt-5 space-y-4">
              
              <label className="block text-sm font-medium">Claim type
                <select value={newClaim.type} onChange={e => setNewClaim({ ...newClaim, type: e.target.value })}
                  className={`${focus} mt-1.5 w-full rounded-md border border-[#CBD3CE] bg-white px-3 py-2.5 text-sm font-normal`}>
                  <option>Medical</option><option>Auto</option><option>Property</option>
                </select>
              </label>
                            <label className="block text-sm font-medium">
                Select policy
                <select
                  required
                  value={newClaim.policyId ?? ""}
                  onChange={(e) =>
                    setNewClaim({
                      ...newClaim,
                      policyId: e.target.value,
                      type:
                        policies.find(
                          (p) => p.id === Number(e.target.value)
                        )?.type === "medical"
                          ? "Medical"
                          : policies.find(
                              (p) => p.id === Number(e.target.value)
                            )?.type === "auto"
                            ? "Auto"
                            : "Property",
                    })
                  }
                  className={`${focus} mt-1.5 w-full rounded-md border border-[#CBD3CE] bg-white px-3 py-2.5 text-sm font-normal`}
                >
                  <option value="">Choose a policy</option>
                  {policies
                    .filter((policy) => policy.status === "active")
                    .map((policy) => (
                      <option key={policy.id} value={policy.id}>
                        {policy.holderName} — {policy.type} — Policy #{policy.id} — ₹
                        {policy.coverageAmount.toLocaleString("en-IN")}
                      </option>
                    ))}
                </select>
              </label>

                            <label className="block text-sm font-medium">
                Incident date
                <input
                  required
                  type="date"
                  value={newClaim.incidentDate}
                  onChange={(e) =>
                    setNewClaim((prev) => ({
                      ...prev,
                      incidentDate: e.target.value,
                    }))
                  }
                  className={`${focus} mt-1.5 w-full rounded-md border border-[#CBD3CE] px-3 py-2.5 text-sm font-normal`}
                />
              </label>
              <label className="block text-sm font-medium">Claim amount (₹)
                <input required min="1" type="number" value={newClaim.amount} onChange={e => setNewClaim({ ...newClaim, amount: e.target.value })} placeholder="e.g. 25000"
                  className={`${focus} mt-1.5 w-full rounded-md border border-[#CBD3CE] px-3 py-2.5 text-sm font-normal`} />
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowNewClaim(false)} className={`${focus} flex-1 rounded-md border border-[#CBD3CE] px-4 py-2.5 text-sm font-semibold hover:bg-[#E8EDEA]`}>Cancel</button>
              <button type="submit" className={`${focus} flex-1 rounded-md bg-[#0F5C55] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4A44]`}>Add claim</button>
            </div>
          </form>
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div role="status" className="fixed bottom-5 left-1/2 z-[60] flex max-w-sm -translate-x-1/2 items-start gap-3 rounded-md bg-[#0F2A27] px-4 py-3 text-sm text-white shadow-xl">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
