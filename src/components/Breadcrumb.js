import { Link, useLocation } from 'react-router-dom';

export default function Breadcrumb({ crumbs }) {
  const { search } = useLocation();

  return (
    <nav className="px-8 pt-4 pb-2">
      <ol className="flex items-center gap-1 text-sm text-mqd-title font-medium">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.label} className="flex items-center gap-1">
              {isLast ? (
                <span className="text-mqd-title">{crumb.label}</span>
              ) : (
                <Link to={{ pathname: crumb.path, search }} className="hover:underline text-mqd-title">
                  {crumb.label}
                </Link>
              )}
              {!isLast && <span className="text-mqd-title">&gt;</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
