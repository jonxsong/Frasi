import { CircleUserRound } from "lucide-react";
import { Brand } from "./Brand";
import { useStudioStore, type Workspace } from "@/store/studio";
import styles from "./Studio.module.css";

const nav: Array<{ id: Workspace; label: string }> = [
  { id: "transcribe", label: "Transcribe" },
  { id: "practice", label: "Practice" },
  { id: "library", label: "Library" },
  { id: "explore", label: "Explore" },
];

export function Header() {
  const workspace = useStudioStore((state) => state.workspace);
  const setWorkspace = useStudioStore((state) => state.setWorkspace);

  return (
    <header className={styles.header}>
      <Brand />
      <nav className={styles.nav} aria-label="Primary navigation">
        {nav.map((item) => (
          <button
            key={item.id}
            className={workspace === item.id ? styles.navActive : styles.navItem}
            aria-current={workspace === item.id ? "page" : undefined}
            onClick={() => setWorkspace(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button className={styles.profileButton} aria-label="Open account menu" type="button">
        <CircleUserRound size={21} strokeWidth={1.5} />
      </button>
    </header>
  );
}
