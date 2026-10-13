.PHONY: lint

# The manual's shape is the one gate a repository of YAML can run; the toolchain's
# other passes need an npm project (docs/guides/test.md).
lint:
	npx --yes --package=@jterrazz/typescript -- typescript docs-layout .
