// Аватар: emoji или картинка по URL.
export function Avatar({
  avatar,
  size = 28,
}: {
  avatar: string | null;
  size?: number;
}) {
  const isImg = !!avatar && /^https?:\/\//.test(avatar);
  if (isImg) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar!}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ fontSize: size * 0.8, width: size, height: size }}
    >
      {avatar || "🙂"}
    </span>
  );
}
