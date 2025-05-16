import ReactMarkdown from 'react-markdown';

import * as Typo from './typography';

export default function Markdown({ ...props }: React.ComponentProps<typeof ReactMarkdown>) {
  return (
    <ReactMarkdown
      {...props}
      components={{
        h1: Typo.TypographyH1,
        h2: Typo.TypographyH2,
        h3: Typo.TypographyH3,
        h4: Typo.TypographyH4,
        p: Typo.TypographyP,
        blockquote: Typo.TypographyBlockquote,
        table: Typo.TypographyTable,
        thead: Typo.TypographyThead,
        tbody: Typo.TypographyTbody,
        tr: Typo.TypographyTr,
        th: Typo.TypographyTh,
        td: Typo.TypographyTd,
        ul: Typo.TypographyUl,
        ol: Typo.TypographyOl,
        li: Typo.TypographyLi,
        code: Typo.TypographyCode,
      }}
    />
  );
}
