package fixture.types;

// Type resolution, source 2: a formal parameter carries the type.
// Without it these units would fall into `?` and dilute the Alpha rule.
public class TypesParameter {

    public void useAlpha(Alpha handle) {
        handle.open();
        handle.close();
    }

    public void useAlphaAgain(Alpha handle) {
        handle.open();
        handle.close();
    }
}
