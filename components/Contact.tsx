import AsciiHeading from "@/components/AsciiHeading";
import { site } from "@/lib/site";

const MAIL = ["#5a2416", "#8f3a22", "#c24a2a", "#ff5a2e", "#ff8a5e", "#ffc2a8"];

/** The flight ends at a giant @ turning in the dark. */
export default function Contact() {
  return (
    <section id="contact" className="ct" data-section="contact">
      <div className="ct-pin">
        <AsciiHeading text="Let's build." className="ct-title" reveal="radial" />
        <div className="ct-bottom" data-quiet>
          <a className="ct-mail" href={`mailto:${site.email}`} aria-label={`email ${site.email}`}>
            <AsciiHeading as="div" text={site.email} uppercase={false} className="ct-mail-art" palette={MAIL} />
          </a>
        </div>
      </div>
    </section>
  );
}
