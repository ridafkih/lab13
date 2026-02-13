ALTER TABLE "sessions" ADD COLUMN "acp_server_id" text;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "sandbox_agent_port";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "sandbox_agent_container_id";