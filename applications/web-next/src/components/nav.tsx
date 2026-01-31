import { tv } from "tailwind-variants";

const nav = tv({
  slots: {
    root: "flex gap-4 px-3 py-2 whitespace-nowrap font-medium",
    link: "text-text-secondary hover:text-text",
  },
  variants: {
    active: {
      true: {
        link: "text-text",
      },
    },
  },
});

type NavItem = {
  label: string;
  href: string;
};

type NavProps = {
  items: NavItem[];
  activeHref?: string;
};

export function Nav({ items, activeHref }: NavProps) {
  const styles = nav();

  return (
    <nav className={styles.root()}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={nav({ active: activeHref === item.href }).link()}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
