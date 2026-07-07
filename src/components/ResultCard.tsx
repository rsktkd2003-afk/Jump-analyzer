type Props = {
  title: string;
  value: string;
  subText?: string;
};

export default function ResultCard({
  title,
  value,
  subText,
}: Props) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: "#f3f3f3",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 14,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 28,
          fontWeight: "bold",
        }}
      >
        {value}
      </div>

      {subText && (
        <div
          style={{
            marginTop: 4,
            fontSize: 14,
          }}
        >
          {subText}
        </div>
      )}
    </div>
  );
}