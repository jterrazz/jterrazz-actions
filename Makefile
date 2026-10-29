.PHONY: lint test

# hazard: an unpinned `--package` runs whichever release npx resolves on that machine, and a clean
# tree went red on one older than the content kind; the pin moves when this tree adopts a release.
lint:
	npx --yes --package=@jterrazz/typescript@12.0.0 -- typescript check

# invariant: the unit tests Self-test runs; Node alone, no dependency to install.
test:
	node --test tests/*.test.mjs
