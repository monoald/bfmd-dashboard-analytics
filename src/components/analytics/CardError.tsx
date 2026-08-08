export interface CardErrorProps {
  title: string;
  message: string;
}

export function CardError({ title, message }: CardErrorProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <p className="text-sm text-red-600">
        Couldn&apos;t load this data: {message}
      </p>
    </div>
  );
}
