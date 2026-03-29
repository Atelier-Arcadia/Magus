.PHONY: test lint typecheck

test:
	bun test

lint:
	bunx tsc --noEmit

typecheck:
	bunx tsc --noEmit
