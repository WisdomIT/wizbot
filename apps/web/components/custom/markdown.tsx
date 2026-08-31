import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import * as Typo from './typography';

export default function Markdown({ ...props }: React.ComponentProps<typeof ReactMarkdown>) {
  return (
    <ReactMarkdown
      //  표·체크박스·취소선·자동 링크 (#206)
      remarkPlugins={[remarkGfm]}
      {...props}
      components={{
        //  본문 중간의 제목은 위 여백이 있어야 단락이 나뉜다 — typography 기본에는 없어 여기서 얹는다 (#206)
        h1: (props) => <Typo.TypographyH1 {...props} className="mt-8 first:mt-0" />,
        h2: (props) => <Typo.TypographyH2 {...props} className="mt-8" />,
        h3: (props) => <Typo.TypographyH3 {...props} className="mt-6 first:mt-0" />,
        h4: (props) => <Typo.TypographyH4 {...props} className="mt-6 first:mt-0" />,
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
