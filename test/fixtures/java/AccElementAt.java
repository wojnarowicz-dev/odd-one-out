package fixture.accessors;

// Exercises the accessor filter for `elementAt` paired with `peek`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccElementAt {

    private Probe26 probe;

    public void holds1() {
        probe.elementAt();
        probe.peek();
    }

    public void holds2() {
        probe.elementAt();
        probe.peek();
    }

    public void holds3() {
        probe.elementAt();
        probe.peek();
    }

    public void holds4() {
        probe.elementAt();
        probe.peek();
    }

    public void deviates() {
        probe.elementAt();
    }
}
