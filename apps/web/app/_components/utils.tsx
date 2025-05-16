import { Fragment, JSX } from 'react';

export function renderTextWithLink(text: string): JSX.Element {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  // 링크가 전혀 없는 경우
  if (parts.length === 1) {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, index) => {
        if (urlRegex.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="inline text-green-600 hover:underline"
            >
              {part}
            </a>
          );
        } else {
          return <Fragment key={index}>{part}</Fragment>;
        }
      })}
    </>
  );
}
