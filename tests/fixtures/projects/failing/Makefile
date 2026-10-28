.PHONY: build lint test

build:
	@echo built

lint:
	@echo "::error file=tests/fixtures/projects/failing/Makefile,line=6::lint: the failing fixture fails its lint on purpose" && exit 1

test:
	@echo "test: 1 passed"
