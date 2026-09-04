import { Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark.tsx";

export function Missing({
  kicker = "Empty chair",
  title = "This page does not exist",
  detail = "That door in the parlor is not here. The hall is still open.",
  home = "/lobby",
  homeLabel = "Back to the hall",
}: {
  kicker?: string;
  title?: string;
  detail?: string;
  home?: string;
  homeLabel?: string;
}) {
  return (
    <>
      <header className="topbar">
        <Link className="mark" to="/">
          <BrandMark kicker="the parlor" />
        </Link>
        <Link className="btn" to={home}>
          {homeLabel}
        </Link>
      </header>
      <section className="missing-page">
        <div className="kicker">{kicker}</div>
        <h1 className="display">{title}</h1>
        <p>{detail}</p>
        <div className="hero-actions">
          <Link className="btn solid" to={home}>
            {homeLabel}
          </Link>
          <Link className="btn" to="/">
            The front door
          </Link>
        </div>
      </section>
    </>
  );
}
