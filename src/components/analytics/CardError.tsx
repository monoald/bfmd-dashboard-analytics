import { CARD_CLASS, LABEL_CLASS } from "./theme";

export interface CardErrorProps {
  title: string;
  message: string;
}

export function CardError({ title, message }: CardErrorProps) {
  return (
    <div className={CARD_CLASS}>
      <p className={`${LABEL_CLASS} mb-2`}>{title}</p>
      <p className="text-[12px] text-(--analytics-down)">
        Couldn&apos;t load this data: {message}
      </p>
    </div>
  );
}
