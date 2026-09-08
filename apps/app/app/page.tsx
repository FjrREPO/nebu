import Link from "next/link";
import { GridLines, Notch } from "@/components/ui";
import { agentCards } from "@/lib/agents";

/** Every card is a live read, so a minute of staleness is the most it keeps. */
export const revalidate = 60;

export default async function Page() {
  const agents = await agentCards();
  const live = agents.filter((agent) => !agent.error).length;
  const acting = agents.filter((agent) => agent.status?.actionable).length;

  return (
    <section className="relative w-full h-screen overflow-hidden bg-black">
      <video
        className="absolute inset-0 w-full h-full object-cover anim-fade-in opacity-70"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_115057_94c3699b-0fd1-4124-bcf3-3626bb8c1f77.mp4"
        autoPlay
        muted
        loop
        playsInline
      />

      <div className="relative z-10 w-full h-full">
        <h1
          className="font-graphik text-white font-normal leading-[1em] absolute anim-fade-up text-[32px] sm:text-[48px] md:text-[68px] top-[140px] sm:top-[160px] md:top-[178px] left-5 md:left-[35px] max-w-[300px] sm:max-w-[420px] md:max-w-[554px]"
          style={{ animationDelay: "400ms" }}
        >
          Idle Positions. Autonomous Repair.
        </h1>

        <GridLines />

        <div className="absolute bottom-5 md:bottom-[35px] left-5 md:left-[35px] right-5 md:right-[35px] flex flex-col md:flex-row items-start md:items-end justify-between gap-5 md:gap-0">
          <Link
            href="/agents"
            className="bg-[#AFDDFF] px-[16px] md:px-[20px] py-[10px] md:py-[12px] flex items-center gap-[10px] hover:bg-[#c8e8ff] transition-colors anim-fade-up"
            style={{ animationDelay: "900ms" }}
          >
            <span className="text-black text-[16px] leading-none">&#10022;</span>
            <span className="font-manrope text-black text-[12px] md:text-[13px] leading-[15.6px] uppercase tracking-wide">
              Browse {agents.length} agents
            </span>
          </Link>

          <div
            className="relative max-w-[280px] hidden sm:block anim-slide-right"
            style={{ animationDelay: "1100ms" }}
          >
            <span className="font-manrope text-black text-[13px] leading-[15.6px] bg-[#AFDDFF] px-[6px] py-[2px] inline-block mb-[10px]">
              NOT A VAULT — AN AGENT DESK
            </span>
            <Notch>
              <p className="font-manrope text-white text-[13px] leading-[18px] mb-[18px]">
                Every reading on this page came off BNB Smart Chain when you loaded it. The agents
                hand you transactions; the signature stays yours.
              </p>
              <span className="font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px]">
                {live}/{agents.length} FEEDS_LIVE · {acting} NEED_ACTION
              </span>
            </Notch>
          </div>
        </div>
      </div>
    </section>
  );
}
