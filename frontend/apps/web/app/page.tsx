import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>EK Transcript</h1>
        <p>Interview transcription and analysis application</p>
        <div className={styles.ctas}>
          <Link href="/dashboard" className={styles.primary}>
            Go to Dashboard
          </Link>
        </div>
      </main>
      <footer className={styles.footer}>
        <span>Powered by AWS AppSync + Cognito</span>
      </footer>
    </div>
  );
}
