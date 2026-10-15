import { BRAND } from "@/lib/brand";
import { dayLong, time12 } from "@/lib/slots";
import { readToken } from "@/lib/token";
import { WillowMark } from "@/components/willow-mark";
import { CheckinForm } from "./checkin-form";

export const metadata = { title: "Pre-visit check-in · Willowbrook Medical Clinic" };

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const data = readToken(t);
  return (
    <div className="min-h-screen bg-wb-sand/50">
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="flex items-center gap-3">
          <WillowMark className="h-11 w-11" />
          <div>
            <p className="text-base font-semibold text-wb-ink">{BRAND.clinicName}</p>
            <p className="text-xs text-slate-500">Pre-visit check-in</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-wb-dark p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-white/60">Your upcoming visit</p>
          {data ? (
            <>
              <p className="mt-1 text-lg font-semibold capitalize">{data.ty}</p>
              <p className="text-sm text-white/80">
                {dayLong(data.d)} at {time12(data.t)}
              </p>
              <p className="text-sm text-white/80">with {data.p}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-white/80">Open this page from your appointment message.</p>
          )}
        </div>

        <div className="mt-5">
          <CheckinForm />
        </div>
      </div>
    </div>
  );
}
