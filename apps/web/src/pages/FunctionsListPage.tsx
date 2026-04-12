import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Fn {
  id: string;
  name: string;
  created_at: string;
}

const DEFAULT_CODE = `export default async function (input, ctx) {
  ctx.log("hello", input);
  return { echo: input };
}
`;

export default function FunctionsListPage() {
  const { request } = useApi();
  const nav = useNavigate();
  const [fns, setFns] = useState<Fn[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function load() {
    const res = await request<{ functions: Fn[] }>("/api/functions");
    setFns(res.functions);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    const res = await request<{ function: Fn }>("/api/functions", {
      method: "POST",
      body: JSON.stringify({ name, code: DEFAULT_CODE }),
    });
    setOpen(false);
    setName("");
    nav(`/functions/${res.function.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Functions</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New function</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New function</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <DialogFooter>
              <Button onClick={create} disabled={!name}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {fns.length === 0 ? (
        <p className="text-zinc-400">No functions yet. Create one to get started.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fns.map((f) => (
              <TableRow
                key={f.id}
                className="cursor-pointer"
                onClick={() => nav(`/functions/${f.id}`)}
              >
                <TableCell>
                  <Link to={`/functions/${f.id}`}>{f.name}</Link>
                </TableCell>
                <TableCell>{new Date(f.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
