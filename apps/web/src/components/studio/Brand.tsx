import Image from "next/image";
import styles from "./Studio.module.css";

export function Brand() {
  return (
    <div className={styles.brand} aria-label="Frasi Jazz Transcription Studio">
      <Image
        className={styles.brandMark}
        src="/brand/frasi-emblem.png"
        alt=""
        aria-hidden="true"
        width={46}
        height={46}
        priority
      />
      <span className={styles.wordmark}>frasi.</span>
      <span className={styles.tagline}>Jazz Transcription Studio</span>
    </div>
  );
}
