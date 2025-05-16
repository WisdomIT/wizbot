export function TypographyH1({ children, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1
      {...props}
      className={`scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl ${
        props.className ?? ''
      }`}
    >
      {children}
    </h1>
  );
}

export function TypographyH2({ children, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      {...props}
      className={`scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0 ${
        props.className ?? ''
      }`}
    >
      {children}
    </h2>
  );
}

export function TypographyH3({ children, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      {...props}
      className={`scroll-m-20 text-2xl font-semibold tracking-tight ${props.className ?? ''}`}
    >
      {children}
    </h3>
  );
}

export function TypographyH4({ children, ...props }: React.ComponentProps<'h4'>) {
  return (
    <h4
      {...props}
      className={`scroll-m-20 text-xl font-semibold tracking-tight ${props.className ?? ''}`}
    >
      {children}
    </h4>
  );
}

export function TypographyP({ ...props }: React.ComponentProps<'p'>) {
  return (
    <p {...props} className={`leading-7 [&:not(:first-child)]:mt-6 ${props.className ?? ''}`} />
  );
}

export function TypographyBlockquote({ ...props }: React.ComponentProps<'blockquote'>) {
  return (
    <blockquote {...props} className={`mt-6 border-l-2 pl-6 italic ${props.className ?? ''}`} />
  );
}

export function TypographyTable({ ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="my-6 w-full overflow-y-auto">
      <table className={`w-full ${props.className ?? ''}`} {...props} />
    </div>
  );
}

export function TypographyThead({ ...props }: React.ComponentProps<'thead'>) {
  return <thead {...props} />;
}

export function TypographyTbody({ ...props }: React.ComponentProps<'tbody'>) {
  return <tbody {...props} />;
}

export function TypographyTr({ ...props }: React.ComponentProps<'tr'>) {
  return <tr {...props} className={`m-0 border-t p-0 even:bg-muted ${props.className ?? ''}`} />;
}

export function TypographyTh({ ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      {...props}
      className={`border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right ${
        props.className ?? ''
      }`}
    />
  );
}

export function TypographyTd({ ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      {...props}
      className={`border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right ${
        props.className ?? ''
      }`}
    />
  );
}

export function TypographyUl({ ...props }: React.ComponentProps<'ul'>) {
  return <ul {...props} className={`my-6 ml-6 list-disc [&>li]:mt-2 ${props.className ?? ''}`} />;
}

export function TypographyOl({ ...props }: React.ComponentProps<'ol'>) {
  return (
    <ol {...props} className={`my-6 ml-6 list-decimal [&>li]:mt-2 ${props.className ?? ''}`} />
  );
}

export function TypographyLi({ ...props }: React.ComponentProps<'li'>) {
  return <li {...props} />;
}

export function TypographyCode({ ...props }: React.ComponentProps<'code'>) {
  return (
    <code
      {...props}
      className={`relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold ${
        props.className ?? ''
      }`}
    />
  );
}

export function TypographyLead({ ...props }: React.ComponentProps<'p'>) {
  return <p {...props} className={`text-xl text-muted-foreground ${props.className ?? ''}`} />;
}

export function TypographyLarge({ ...props }: React.ComponentProps<'div'>) {
  return <div {...props} className={`text-lg font-semibold ${props.className ?? ''}`} />;
}

export function TypographySmall({ ...props }: React.ComponentProps<'small'>) {
  return (
    <small {...props} className={`text-sm font-medium leading-none ${props.className ?? ''}`} />
  );
}

export function TypographyMuted({ ...props }: React.ComponentProps<'p'>) {
  return <p {...props} className={`text-sm text-muted-foreground ${props.className ?? ''}`} />;
}
