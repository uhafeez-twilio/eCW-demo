import Link from "next/link";
import { ASSET_FILES, BRAND, LOCAL_ASSETS } from "@/lib/brand";
import { WillowMark } from "@/components/willow-mark";

export const metadata = { title: "Brand assets · Willowbrook RCS demo" };

export default function AssetsPage() {
  return (
    <div className="min-h-screen bg-wb-sand/40">
      <header className="border-b border-wb-mint bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <WillowMark className="h-9 w-9" />
          <h1 className="mr-auto text-base font-semibold text-wb-ink">Brand assets for RCS cards</h1>
          <Link href="/" className="text-sm font-medium text-wb-primary hover:underline">
            ← Back to demo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-wb-ink">How to use these</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-600">
            <li>Download each image below.</li>
            <li>
              Host them somewhere public (any CDN, S3 bucket, or the Vercel Blob uploader in your dashboard). Twilio and the
              carrier must be able to fetch them without a login.
            </li>
            <li>
              Open <b>Settings → Public image URLs</b> and paste each link (or enter a base URL and press <b>Fill all</b>).
            </li>
            <li>
              Press <b>Create RCS templates</b> so the cards use your new images.
            </li>
          </ol>
          <p className="mt-3 text-[12.5px] text-slate-500">
            Images are 2:1 PNGs under 1 MB, the ratio RCS rich cards display best. Replace them with {BRAND.shortName}&apos;s final
            artwork at any time — just keep the same size.
          </p>
        </section>

        <div className="grid gap-5 sm:grid-cols-2">
          {ASSET_FILES.map((f) => (
            <article key={f.key} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOCAL_ASSETS[f.key]} alt={f.file} className="w-full bg-slate-100 object-cover" />
              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12.5px] font-medium text-slate-800">{f.file}</p>
                  <p className="text-[12px] text-slate-500">
                    {f.size} · {f.usedIn}
                  </p>
                </div>
                <a
                  href={LOCAL_ASSETS[f.key]}
                  download={f.file}
                  className="rounded-lg bg-wb-primary px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-wb-dark"
                >
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
