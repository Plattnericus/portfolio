import AsciiHeading from "@/components/AsciiHeading";

/** After the flight through the O: one line, printed large, next to the object. */
export default function About() {
  return (
    <section id="about" className="about" data-section="about">
      <AsciiHeading text="I build things that run." className="about-title" reveal="assemble" />
      <p className="about-line muted">interfaces / backends / servers / security</p>
    </section>
  );
}
