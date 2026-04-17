import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

export function RouteError() {
  const error = useRouteError();
  const is404 =
    error == null || (isRouteErrorResponse(error) && error.status === 404);

  const title = is404 ? "Page not found" : "Something went wrong";
  const body = is404
    ? "The page you're looking for doesn't exist or has been moved."
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred. Please try again.";

  return (
    <div className="flex h-full items-center justify-center bg-card p-8">
      <EmptyState
        icon={is404 ? <FileQuestion className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
        title={title}
        body={body}
        action={
          <Button asChild>
            <Link to="/functions">
              <Home className="mr-1 h-4 w-4" /> Back to functions
            </Link>
          </Button>
        }
      />
    </div>
  );
}
