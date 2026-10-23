import { Navigate } from 'react-router-dom';

/**
 * Legacy generic Resources page — superseded by Product Resource Management (/resources).
 * The legacy Resource entity has 0 records. This route now redirects to the canonical
 * Product Resource Management dashboard to preserve bookmarks and prevent confusion.
 */
export default function ResourcesAdminPage() {
  return <Navigate to="/resources" replace />;
}