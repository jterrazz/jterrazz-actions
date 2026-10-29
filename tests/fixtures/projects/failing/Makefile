.PHONY: build lint test

build:
	@echo built

# value: the verdict line @jterrazz/typescript ends on, coloured as in CI, which the gate's note reads.
lint:
	@echo "::error file=tests/fixtures/projects/failing/Makefile,line=8::lint: the failing fixture fails its lint on purpose"
	@printf '\033[0;31m✗ 15 passes, 2 failed: types, lint\033[0m\n' && exit 1

test:
	@echo "test: 1 passed"
