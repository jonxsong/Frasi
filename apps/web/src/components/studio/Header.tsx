import { CircleUserRound } from "lucide-react";
import { Brand } from "./Brand";
import { useStudioStore, type Workspace } from "@/store/studio";
import { useAuthStore } from "@/store/auth";
import styles from "./Studio.module.css";

const nav: Array<{ id: Workspace; label: string }> = [
  { id: "transcribe", label: "Transcribe" },
  { id: "practice", label: "Practice" },
  { id: "library", label: "Library" },
  { id: "explore", label: "Explore" },
];

interface HeaderProps {
  onAccount: () => void;
}

export function Header({ onAccount }: HeaderProps) {
  const workspace = useStudioStore((state) => state.workspace);
  const setWorkspace = useStudioStore((state) => state.setWorkspace);
  const user = useAuthStore((state) => state.user);

  return (
    <header className={styles.header}>
      <Brand />
      <nav className={styles.nav} aria-label="Primary navigation">
        {nav.map((item) => (
          <button
            key={item.id}
            className={
              workspace === item.id ? styles.navActive : styles.navItem
            }
            aria-current={workspace === item.id ? "page" : undefined}
            onClick={() => setWorkspace(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button
        className={user ? styles.profileButtonActive : styles.profileButton}
        aria-label={
          user ? `Account for ${user.display_name}` : "Open account menu"
        }
        onClick={onAccount}
        type="button"
      >
        {user ? (
          user.display_name.slice(0, 1).toUpperCase()
        ) : (
          <CircleUserRound size={21} strokeWidth={1.5} />
        )}
      </button>
    </header>
  );
}
