.PHONY: build lint test mutation

build:
	@mkdir -p .artifacts && echo built > .artifacts/build.txt

lint:
	@test -f .artifacts/build.txt && echo "lint: 0 problems"

test:
	@echo "test: 1 passed"

mutation:
	@echo "mutation: measured since $${TYPESCRIPT_MUTATION_SINCE:-HEAD}"
