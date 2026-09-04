export function BrandMark({ kicker }: { kicker?: string }) {
  return (
    <>
      <span className="ring">
        <img src="/icon-192.png" alt="" width={34} height={34} />
      </span>
      <div>
        <strong>Baithak</strong>
        {kicker ? <span>{kicker}</span> : null}
      </div>
    </>
  );
}
