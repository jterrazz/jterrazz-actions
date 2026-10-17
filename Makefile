.PHONY: lint

lint:
	npx --yes --package=@jterrazz/typescript -- typescript check
