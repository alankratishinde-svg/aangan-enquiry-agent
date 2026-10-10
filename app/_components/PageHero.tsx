import Image from "next/image";

/** The band at the top of each dashboard: the room, a large title, and a frosted bar for the controls. */
export function PageHero({ title, intro, children }: { title: string; intro: string; children?: React.ReactNode }) {
  return (
    <section className="pagehero">
      <div className="pagehero-img"><Image src="/hero-lounge.jpg" alt="" fill sizes="(max-width: 1200px) 100vw, 1180px" /></div>
      <div className="pagehero-copy">
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      {children && <div className="glass">{children}</div>}
    </section>
  );
}
