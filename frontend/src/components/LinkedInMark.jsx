// Small "in" mark identifying the LinkedIn connector (section 59).
export default function LinkedInMark({ size = 32 }) {
  return (
    <svg className="linkedin-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#0a66c2" />
      <rect x="7" y="12.5" width="4" height="12" fill="#fff" />
      <circle cx="9" cy="8.6" r="2.3" fill="#fff" />
      <path d="M14.5 12.5h3.8v1.7c.6-1.1 2-2 3.9-2 3.4 0 4.3 2.2 4.3 5.1v7.2h-4v-6.4c0-1.5-.3-2.7-1.9-2.7-1.7 0-2.1 1.2-2.1 2.8v6.3h-4z" fill="#fff" />
    </svg>
  );
}
